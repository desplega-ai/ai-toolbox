# Lead Command Implementation Plan

## Overview

Implement a `lead` command for the cc-orch-mcp CLI by refactoring the existing worker implementation to share common code. Extract the Claude runner loop into a shared module, then create thin `worker.ts` and `lead.ts` wrappers that configure role-specific behavior.

## Current State Analysis

### Worker Implementation (Reference)
- **CLI Command**: `src/commands/worker.ts` - 226 lines of code with duplicated runner logic
- **Key Logic**: Infinite loop running Claude CLI with stream processing
- **Configuration**: Hardcoded `[worker]` prefix, `WORKER_*` env vars, `/start-worker` prompt

### Key Discoveries:
- `worker.ts` contains ~150 lines of `runClaudeIteration()` that would be identical for lead
- Only differences: log prefix, env var names, default prompt, metadata type
- Current code uses `mkdir` from `node:fs/promises` but could use Bun native APIs

## Desired End State

After implementation:
1. Shared `runner.ts` module handles all Claude CLI execution logic
2. `worker.ts` is a thin wrapper (~30 lines) configuring worker behavior
3. `lead.ts` is a thin wrapper (~30 lines) configuring lead behavior
4. Both use Bun's native file APIs (`Bun.write`, `Bun.file`)
5. Docker files exist for lead deployment

### Verification:
- `bun src/cli.tsx lead` starts a lead agent loop
- `bun src/cli.tsx worker` still works as before
- `docker build -f Dockerfile.lead .` builds successfully

## What We're NOT Doing

- Changing CLI argument parsing
- Modifying MCP server or tools
- Adding new features beyond lead command
- Breaking existing worker functionality

## Implementation Approach

1. Extract common runner logic into `src/commands/runner.ts`
2. Refactor `worker.ts` to use the shared runner
3. Create `lead.ts` using the shared runner
4. Integrate into CLI
5. Add Docker support

---

## Phase 1: Create Shared Runner Module

### Overview
Extract the common Claude execution loop into a configurable shared module using Bun native APIs.

### Changes Required:

#### 1. Create Shared Runner
**File**: `cc-orch-mcp/src/commands/runner.ts`
**Changes**: New file with shared Claude execution logic

```typescript
import { mkdir } from "node:fs/promises";

/** Configuration for a runner role (worker or lead) */
export interface RunnerConfig {
  /** Role name for logging, e.g., "worker" or "lead" */
  role: string;
  /** Default prompt if none provided */
  defaultPrompt: string;
  /** Environment variable name for YOLO mode, e.g., "WORKER_YOLO" */
  yoloEnvVar: string;
  /** Environment variable name for log directory, e.g., "WORKER_LOG_DIR" */
  logDirEnvVar: string;
  /** Metadata type for log files, e.g., "worker_metadata" */
  metadataType: string;
}

export interface RunnerOptions {
  prompt?: string;
  yolo?: boolean;
  additionalArgs?: string[];
}

interface RunClaudeIterationOptions {
  prompt: string;
  logFile: string;
  additionalArgs?: string[];
  role: string;
}

async function runClaudeIteration(opts: RunClaudeIterationOptions): Promise<number> {
  const { role } = opts;
  const CMD = [
    "claude",
    "--verbose",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
    "--allow-dangerously-skip-permissions",
    "--permission-mode",
    "bypassPermissions",
    "-p",
    opts.prompt,
  ];

  if (opts.additionalArgs && opts.additionalArgs.length > 0) {
    CMD.push(...opts.additionalArgs);
  }

  console.log(`[${role}] Running: claude ... -p "${opts.prompt}"`);

  const logFileHandle = Bun.file(opts.logFile).writer();
  let stderrOutput = "";

  const proc = Bun.spawn(CMD, {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  console.log(`[${role}] Process spawned, PID: ${proc.pid}`);
  console.log(`[${role}] Waiting for output streams...`);

  let stdoutChunks = 0;
  let stderrChunks = 0;

  const stdoutPromise = (async () => {
    console.log(`[${role}] stdout stream: ${proc.stdout ? "available" : "not available"}`);
    if (proc.stdout) {
      for await (const chunk of proc.stdout) {
        stdoutChunks++;
        const text = new TextDecoder().decode(chunk);
        logFileHandle.write(text);
        console.log(`[${role}] stdout chunk #${stdoutChunks} (${chunk.length} bytes)`);

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const json = JSON.parse(line.trim());
            if (json.type === "assistant" && json.message) {
              const preview = json.message.slice(0, 100);
              console.log(`[${role}] Assistant: ${preview}${json.message.length > 100 ? "..." : ""}`);
            } else if (json.type === "tool_use") {
              console.log(`[${role}] Tool: ${json.tool || json.name || "unknown"}`);
            } else if (json.type === "result") {
              const resultPreview = JSON.stringify(json).slice(0, 200);
              console.log(`[${role}] Result: ${resultPreview}${JSON.stringify(json).length > 200 ? "..." : ""}`);
            } else if (json.type === "error") {
              console.error(`[${role}] Error from Claude: ${json.error || json.message || JSON.stringify(json)}`);
            } else if (json.type === "system") {
              const msg = json.message || json.content || "";
              const preview = typeof msg === "string" ? msg.slice(0, 150) : JSON.stringify(msg).slice(0, 150);
              console.log(`[${role}] System: ${preview}${preview.length >= 150 ? "..." : ""}`);
            } else {
              console.log(`[${role}] Event type: ${json.type} - ${JSON.stringify(json).slice(0, 100)}`);
            }
          } catch {
            if (line.trim()) {
              console.log(`[${role}] Raw output: ${line.trim()}`);
            }
          }
        }
      }
      console.log(`[${role}] stdout stream ended (total ${stdoutChunks} chunks)`);
    }
  })();

  const stderrPromise = (async () => {
    console.log(`[${role}] stderr stream: ${proc.stderr ? "available" : "not available"}`);
    if (proc.stderr) {
      for await (const chunk of proc.stderr) {
        stderrChunks++;
        const text = new TextDecoder().decode(chunk);
        stderrOutput += text;
        console.error(`[${role}] stderr chunk #${stderrChunks}: ${text.trim()}`);
        logFileHandle.write(
          JSON.stringify({ type: "stderr", content: text, timestamp: new Date().toISOString() }) + "\n"
        );
      }
      console.log(`[${role}] stderr stream ended (total ${stderrChunks} chunks)`);
    }
  })();

  console.log(`[${role}] Waiting for streams to complete...`);
  await Promise.all([stdoutPromise, stderrPromise]);

  await logFileHandle.end();
  console.log(`[${role}] Waiting for process to exit...`);
  const exitCode = await proc.exited;

  console.log(`[${role}] Claude exited with code ${exitCode}`);
  console.log(`[${role}] Total stdout chunks: ${stdoutChunks}, stderr chunks: ${stderrChunks}`);

  if (exitCode !== 0 && stderrOutput) {
    console.error(`[${role}] Full stderr output:\n${stderrOutput}`);
  }

  if (stdoutChunks === 0 && stderrChunks === 0) {
    console.warn(`[${role}] WARNING: No output received from Claude at all!`);
    console.warn(`[${role}] This might indicate Claude failed to start or auth issues.`);
  }

  return exitCode ?? 1;
}

export async function runAgent(config: RunnerConfig, opts: RunnerOptions) {
  const { role, defaultPrompt, yoloEnvVar, logDirEnvVar, metadataType } = config;

  const sessionId = process.env.SESSION_ID || crypto.randomUUID().slice(0, 8);
  const baseLogDir = process.env[logDirEnvVar] || "./logs";
  const logDir = `${baseLogDir}/${sessionId}`;

  await mkdir(logDir, { recursive: true });

  const prompt = opts.prompt || defaultPrompt;
  const isYolo = opts.yolo || process.env[yoloEnvVar] === "true";

  console.log(`[${role}] Starting ${role}`);
  console.log(`[${role}] Session ID: ${sessionId}`);
  console.log(`[${role}] Log directory: ${logDir}`);
  console.log(`[${role}] YOLO mode: ${isYolo ? "enabled" : "disabled"}`);
  console.log(`[${role}] Prompt: ${prompt}`);

  let iteration = 0;

  while (true) {
    iteration++;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = `${logDir}/${timestamp}.jsonl`;

    console.log(`\n[${role}] === Iteration ${iteration} ===`);
    console.log(`[${role}] Logging to: ${logFile}`);

    const metadata = {
      type: metadataType,
      sessionId,
      iteration,
      timestamp: new Date().toISOString(),
      prompt,
      yolo: isYolo,
    };
    await Bun.write(logFile, `${JSON.stringify(metadata)}\n`);

    const exitCode = await runClaudeIteration({
      prompt,
      logFile,
      additionalArgs: opts.additionalArgs,
      role,
    });

    if (exitCode !== 0) {
      const errorLog = {
        timestamp: new Date().toISOString(),
        iteration,
        exitCode,
        error: true,
      };

      const errorsFile = `${logDir}/errors.jsonl`;
      const errorsFileRef = Bun.file(errorsFile);
      const existingErrors = (await errorsFileRef.exists()) ? await errorsFileRef.text() : "";
      await Bun.write(errorsFile, `${existingErrors}${JSON.stringify(errorLog)}\n`);

      if (!isYolo) {
        console.error(`[${role}] Claude exited with code ${exitCode}. Stopping.`);
        console.error(`[${role}] Error logged to: ${errorsFile}`);
        process.exit(exitCode);
      }

      console.warn(`[${role}] Claude exited with code ${exitCode}. YOLO mode - continuing...`);
    }

    console.log(`[${role}] Iteration ${iteration} complete. Starting next iteration...`);
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `ls cc-orch-mcp/src/commands/runner.ts`
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`
- [ ] Linting passes: `cd cc-orch-mcp && bun run lint`

#### Manual Verification:
- [ ] Code review confirms shared logic is properly extracted

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Refactor Worker to Use Shared Runner

### Overview
Replace the worker implementation with a thin wrapper using the shared runner.

### Changes Required:

#### 1. Update Worker Command
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Changes**: Replace entire file with thin wrapper

```typescript
import { runAgent, type RunnerConfig, type RunnerOptions } from "./runner.ts";

export type WorkerOptions = RunnerOptions;

const workerConfig: RunnerConfig = {
  role: "worker",
  defaultPrompt: "/start-worker Start or continue the tasks your leader assigned you!",
  yoloEnvVar: "WORKER_YOLO",
  logDirEnvVar: "WORKER_LOG_DIR",
  metadataType: "worker_metadata",
};

export async function runWorker(opts: WorkerOptions) {
  return runAgent(workerConfig, opts);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`
- [ ] Linting passes: `cd cc-orch-mcp && bun run lint`

#### Manual Verification:
- [ ] `bun src/cli.tsx worker` still works as before
- [ ] Logs show `[worker]` prefix
- [ ] WORKER_YOLO env var still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that worker still works before proceeding.

---

## Phase 3: Create Lead Command

### Overview
Create the lead command as a thin wrapper using the shared runner.

### Changes Required:

#### 1. Create Lead Command
**File**: `cc-orch-mcp/src/commands/lead.ts`
**Changes**: New file - thin wrapper for lead behavior

```typescript
import { runAgent, type RunnerConfig, type RunnerOptions } from "./runner.ts";

export type LeadOptions = RunnerOptions;

const leadConfig: RunnerConfig = {
  role: "lead",
  defaultPrompt: "/setup-leader Setup the agent swarm and begin coordinating workers!",
  yoloEnvVar: "LEAD_YOLO",
  logDirEnvVar: "LEAD_LOG_DIR",
  metadataType: "lead_metadata",
};

export async function runLead(opts: LeadOptions) {
  return runAgent(leadConfig, opts);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `ls cc-orch-mcp/src/commands/lead.ts`
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`
- [ ] Linting passes: `cd cc-orch-mcp && bun run lint`

#### Manual Verification:
- [ ] Code is consistent with worker.ts structure

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to CLI integration.

---

## Phase 4: CLI Integration

### Overview
Integrate the lead command into the CLI.

### Changes Required:

#### 1. Update CLI
**File**: `cc-orch-mcp/src/cli.tsx`
**Changes**: Add lead command import, component, routing, and help text

**Add import** (after line 9):
```typescript
import { runLead } from "./commands/lead.ts";
```

**Add LeadRunner component** (after WorkerRunner, around line 385):
```typescript
interface LeadRunnerProps {
  prompt: string;
  yolo: boolean;
  additionalArgs: string[];
}

function LeadRunner({ prompt, yolo, additionalArgs }: LeadRunnerProps) {
  const { exit } = useApp();

  useEffect(() => {
    runLead({
      prompt: prompt || undefined,
      yolo,
      additionalArgs,
    }).catch((err) => exit(err));
  }, [prompt, yolo, additionalArgs, exit]);

  return null;
}
```

**Add switch case** (after worker case, around line 427):
```typescript
    case "lead":
      return <LeadRunner prompt={msg} yolo={yolo} additionalArgs={additionalArgs} />;
```

**Add to Help Commands section** (after worker command, around line 138):
```typescript
        <Box>
          <Box width={12}>
            <Text color="green">lead</Text>
          </Box>
          <Text>Run Claude as lead agent in headless loop</Text>
        </Box>
```

**Add lead options help** (after worker options, around line 233):
```typescript
      <Box marginTop={1} flexDirection="column">
        <Text bold>Options for 'lead':</Text>
        <Box>
          <Box width={24}>
            <Text color="yellow">-m, --msg {"<prompt>"}</Text>
          </Box>
          <Text>Custom prompt (default: /setup-leader)</Text>
        </Box>
        <Box>
          <Box width={24}>
            <Text color="yellow">--yolo</Text>
          </Box>
          <Text>Continue on errors instead of stopping</Text>
        </Box>
        <Box>
          <Box width={24}>
            <Text color="yellow">-- {"<args...>"}</Text>
          </Box>
          <Text>Additional arguments to pass to Claude CLI</Text>
        </Box>
      </Box>
```

**Add lead examples** (after worker examples, around line 248):
```typescript
        <Text dimColor> {binName} lead</Text>
        <Text dimColor> {binName} lead --yolo</Text>
        <Text dimColor> {binName} lead -m "Custom prompt"</Text>
```

**Add lead env vars to help** (after WORKER_YOLO, around line 288):
```typescript
        <Box>
          <Box width={24}>
            <Text color="magenta">LEAD_YOLO</Text>
          </Box>
          <Text>If "true", lead continues on errors</Text>
        </Box>
        <Box>
          <Box width={24}>
            <Text color="magenta">LEAD_LOG_DIR</Text>
          </Box>
          <Text>Directory for lead agent logs</Text>
        </Box>
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`
- [ ] Linting passes: `cd cc-orch-mcp && bun run lint`
- [ ] Help shows lead: `cd cc-orch-mcp && bun src/cli.tsx help | grep -q lead`

#### Manual Verification:
- [ ] `bun src/cli.tsx lead` starts with `[lead] Starting lead`
- [ ] `bun src/cli.tsx worker` still works
- [ ] Ctrl+C stops cleanly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to package scripts.

---

## Phase 5: Package.json Scripts

### Overview
Add npm scripts for lead command.

### Changes Required:

#### 1. Update Package Scripts
**File**: `cc-orch-mcp/package.json`
**Changes**: Add lead scripts after worker scripts (around line 21)

```json
    "lead": "bun src/cli.tsx lead",
    "lead:yolo": "bun src/cli.tsx lead --yolo",
```

### Success Criteria:

#### Automated Verification:
- [ ] JSON valid: `cd cc-orch-mcp && cat package.json | jq .`
- [ ] Script works: `cd cc-orch-mcp && bun run lead 2>&1 | head -3`

#### Manual Verification:
- [ ] `bun run lead` matches `bun src/cli.tsx lead`

**Implementation Note**: After completing this phase, pause for manual confirmation before Docker setup.

---

## Phase 6: Docker Support

### Overview
Reuse existing Docker infrastructure by making the entrypoint generic. The Dockerfile stays the same - only the entrypoint and compose files need minor changes.

### Changes Required:

#### 1. Update Existing Entrypoint to Support Both Roles
**File**: `cc-orch-mcp/docker-entrypoint.sh`
**Changes**: Make role configurable via `AGENT_ROLE` env var (default: worker)

```bash
#!/bin/bash
set -e

# Validate required environment variables
if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo "Error: CLAUDE_CODE_OAUTH_TOKEN environment variable is required"
    exit 1
fi

if [ -z "$API_KEY" ]; then
    echo "Error: API_KEY environment variable is required"
    exit 1
fi

# Role defaults to worker, can be set to "lead"
ROLE="${AGENT_ROLE:-worker}"
MCP_URL="${MCP_BASE_URL:-http://host.docker.internal:3013}"

# Determine YOLO mode based on role
if [ "$ROLE" = "lead" ]; then
    YOLO_MODE="${LEAD_YOLO:-false}"
else
    YOLO_MODE="${WORKER_YOLO:-false}"
fi

echo "=== Agent Swarm ${ROLE^} ==="
echo "Agent ID: ${AGENT_ID:-<not set>}"
echo "MCP Base URL: $MCP_URL"
echo "YOLO Mode: $YOLO_MODE"
echo "Session ID: ${SESSION_ID:-<auto-generated>}"
echo "Working Directory: /workspace"
echo "=========================="

# Create .mcp.json in /workspace (project-level config)
echo "Creating MCP config in /workspace..."
if [ -n "$AGENT_ID" ]; then
    cat > /workspace/.mcp.json << EOF
{
  "mcpServers": {
    "agent-swarm": {
      "type": "http",
      "url": "${MCP_URL}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}",
        "X-Agent-ID": "${AGENT_ID}"
      }
    }
  }
}
EOF
else
    cat > /workspace/.mcp.json << EOF
{
  "mcpServers": {
    "agent-swarm": {
      "type": "http",
      "url": "${MCP_URL}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
EOF
fi

# Run the agent using compiled binary
echo "Starting $ROLE..."
exec /usr/local/bin/agent-swarm "$ROLE" "$@"
```

#### 2. Update Dockerfile.worker to Be Generic
**File**: `cc-orch-mcp/Dockerfile.worker`
**Changes**: Add `AGENT_ROLE` env var with default value

Add this line in the Environment section (around line 115):
```dockerfile
ENV AGENT_ROLE=worker
```

#### 3. Create Docker Compose for Lead (Reuses Same Image)
**File**: `cc-orch-mcp/docker-compose.lead.yml`
**Changes**: New file - uses same Dockerfile, just sets AGENT_ROLE=lead

```yaml
# Docker Compose for Agent Swarm Lead
#
# Usage:
#   docker-compose -f docker-compose.lead.yml up --build
#
# Uses the same Dockerfile as worker, just with AGENT_ROLE=lead

services:
  lead:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      - AGENT_ROLE=lead
      - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}
      - API_KEY=${API_KEY}
      - AGENT_ID=${AGENT_ID:-}
      - MCP_BASE_URL=${MCP_BASE_URL:-http://host.docker.internal:3013}
      - SESSION_ID=${SESSION_ID:-}
      - LEAD_YOLO=${LEAD_YOLO:-false}
    volumes:
      - ./logs:/logs
    restart: unless-stopped
```

#### 4. Add Docker Scripts to Package.json
**File**: `cc-orch-mcp/package.json`
**Changes**: Add after docker:run:worker (around line 34)

```json
    "docker:run:lead": "docker run --rm -it --env-file .env.docker -e AGENT_ROLE=lead -v ./logs:/logs -v ./work:/workspace agent-swarm-worker:latest",
```

Note: No separate `docker:build:lead` needed - we reuse the same image!

### Success Criteria:

#### Automated Verification:
- [ ] Compose file exists: `ls cc-orch-mcp/docker-compose.lead.yml`
- [ ] Entrypoint handles role: `grep -q 'AGENT_ROLE' cc-orch-mcp/docker-entrypoint.sh`
- [ ] Docker build succeeds: `cd cc-orch-mcp && docker build -f Dockerfile.worker -t agent-swarm:test .`

#### Manual Verification:
- [ ] `docker run ... -e AGENT_ROLE=worker` starts worker
- [ ] `docker run ... -e AGENT_ROLE=lead` starts lead
- [ ] Lead joins swarm with `isLead: true`

**Implementation Note**: After completing this phase, the implementation is complete.

---

## Testing Strategy

### Integration Tests:
- Worker still works after refactoring
- Lead command starts and runs
- Both share same log format

### Manual Testing Steps:
1. Run `bun src/cli.tsx worker` - verify still works
2. Run `bun src/cli.tsx lead` - verify starts with `[lead]` prefix
3. Check logs are written correctly
4. Test `--yolo` flag for both
5. Build and run Docker containers

## Performance Considerations

No performance impact - refactoring only, same execution logic.

## Migration Notes

None - worker behavior unchanged, lead is additive.

## References

- Worker implementation: `cc-orch-mcp/src/commands/worker.ts`
- CLI integration: `cc-orch-mcp/src/cli.tsx`
- Setup leader command: `cc-orch-mcp/cc-plugin/commands/setup-leader.md`
