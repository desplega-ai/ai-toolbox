# System Prompt Support Implementation Plan

> **Status: IMPLEMENTED** (2025-12-18)
>
> **Implementation Note**: This plan was updated to reflect the runner abstraction refactor.
> The core logic is now in `runner.ts` (shared by both `worker` and `lead` commands) rather
> than `worker.ts`. Both commands now support system prompts with their own environment variables.

## Overview

Add support for custom system prompts to be passed to Claude CLI via `--append-system-prompt` flag. This allows users to specialize worker behavior through CLI flags or environment variables.

## Current State Analysis

### Runner Architecture (Updated)
- **Runner Module**: `src/commands/runner.ts` - shared logic for running Claude CLI in infinite loop
- **Worker Command**: `src/commands/worker.ts` - thin wrapper that defines worker config
- **Lead Command**: `src/commands/lead.ts` - thin wrapper that defines lead config
- **CLI Parsing**: `src/cli.tsx` - handles argument parsing and component rendering
- **Current Options**: `-m/--msg` (prompt), `--yolo` (error handling), `--system-prompt`, `--system-prompt-file`, `--` (passthrough args)

### Key Discoveries:
- `runner.ts:3-19` - `RunnerConfig` interface defines role-specific configuration including env var names
- `runner.ts:21-27` - `RunnerOptions` interface defines runtime options including system prompt
- `runner.ts:155-237` - `runAgent()` function handles system prompt resolution and the main loop
- `cli.tsx:23-36` - `ParsedArgs` interface defines CLI arguments
- Claude CLI supports `--append-system-prompt <text>` flag for custom system prompts

## Desired End State

After implementation:
1. Users can pass system prompts via CLI flags: `--system-prompt <text>` or `--system-prompt-file <path>`
2. Users can set system prompts via environment variables (role-specific):
   - Worker: `WORKER_SYSTEM_PROMPT` or `WORKER_SYSTEM_PROMPT_FILE`
   - Lead: `LEAD_SYSTEM_PROMPT` or `LEAD_SYSTEM_PROMPT_FILE`
3. CLI flags take precedence over environment variables
4. System prompt is passed to Claude CLI via `--append-system-prompt` flag
5. Clear error messages when file doesn't exist or can't be read
6. Both `worker` and `lead` commands support system prompts

### Verification:
- `agent-swarm worker --system-prompt "You are a specialist"` passes prompt to Claude
- `agent-swarm worker --system-prompt-file /path/to/prompt.txt` reads and passes file content
- `agent-swarm lead --system-prompt "You are a coordinator"` passes prompt to Claude
- `WORKER_SYSTEM_PROMPT="text" agent-swarm worker` uses env var
- `LEAD_SYSTEM_PROMPT="text" agent-swarm lead` uses env var
- File not found errors are clear and worker/lead exits gracefully

## What We're NOT Doing

- Modifying MCP server or tools
- Changing the core worker loop logic
- Adding prompt validation or sanitization (Claude CLI handles this)
- Supporting multiple system prompts or prompt composition
- Adding prompt templates or variables

## Implementation Approach

1. Extend CLI parsing to accept new flags and read env vars
2. Update TypeScript interfaces to include system prompt options
3. Add file reading logic with error handling in worker command
4. Pass resolved system prompt to Claude CLI command array
5. Update help text and documentation

## Phase 1: CLI Argument Parsing

### Overview
Update CLI to accept system prompt flags and environment variables.

### Changes Required:

#### 1. Update ParsedArgs Interface
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: Lines 22-33
**Changes**: Add two new fields

```typescript
interface ParsedArgs {
  command: string | undefined;
  port: string;
  key: string;
  msg: string;
  headless: boolean;
  dryRun: boolean;
  restore: boolean;
  yes: boolean;
  yolo: boolean;
  systemPrompt: string;           // NEW
  systemPromptFile: string;       // NEW
  additionalArgs: string[];
}
```

#### 2. Update parseArgs Function
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: Lines 35-76
**Changes**: Initialize from env vars and parse new flags

Add after line 44 (variable initialization):
```typescript
  let systemPrompt = process.env.WORKER_SYSTEM_PROMPT || "";
  let systemPromptFile = process.env.WORKER_SYSTEM_PROMPT_FILE || "";
```

Add in the for loop after line 72 (yolo handling):
```typescript
    } else if (arg === "--system-prompt") {
      systemPrompt = mainArgs[i + 1] || systemPrompt;
      i++;
    } else if (arg === "--system-prompt-file") {
      systemPromptFile = mainArgs[i + 1] || systemPromptFile;
      i++;
```

Update return statement at line 76:
```typescript
  return { command, port, key, msg, headless, dryRun, restore, yes, yolo, systemPrompt, systemPromptFile, additionalArgs };
```

#### 3. Update WorkerRunnerProps Interface
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: Lines 366-370
**Changes**: Add system prompt fields

```typescript
interface WorkerRunnerProps {
  prompt: string;
  yolo: boolean;
  systemPrompt: string;           // NEW
  systemPromptFile: string;       // NEW
  additionalArgs: string[];
}
```

#### 4. Update WorkerRunner Component
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: Lines 372-385
**Changes**: Pass new props and add to dependency array

Update component signature (line 372):
```typescript
function WorkerRunner({ prompt, yolo, systemPrompt, systemPromptFile, additionalArgs }: WorkerRunnerProps) {
```

Update runWorker call (line 376-380):
```typescript
    runWorker({
      prompt: prompt || undefined,
      yolo,
      systemPrompt,               // NEW
      systemPromptFile,           // NEW
      additionalArgs,
    }).catch((err) => exit(err));
```

Update dependency array (line 382):
```typescript
  }, [prompt, yolo, systemPrompt, systemPromptFile, additionalArgs, exit]);
```

#### 5. Update App Component Routing
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: Line 427
**Changes**: Pass new props to WorkerRunner

```typescript
    case "worker":
      return <WorkerRunner prompt={msg} yolo={yolo} systemPrompt={systemPrompt} systemPromptFile={systemPromptFile} additionalArgs={additionalArgs} />;
```

And destructure in App function (line 417):
```typescript
  const { command, port, key, msg, headless, dryRun, restore, yes, yolo, systemPrompt, systemPromptFile, additionalArgs } = args;
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`
- [ ] Linting passes: `cd cc-orch-mcp && bun run lint`

#### Manual Verification:
- [ ] CLI parsing doesn't crash with new flags
- [ ] Help command still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for confirmation before proceeding.

---

## Phase 2: Worker Logic Implementation

### Overview
Add system prompt resolution and file reading logic in the worker command.

### Changes Required:

#### 1. Update WorkerOptions Interface
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Location**: Lines 3-7
**Changes**: Add system prompt fields

```typescript
export interface WorkerOptions {
  prompt?: string;
  yolo?: boolean;
  systemPrompt?: string;          // NEW
  systemPromptFile?: string;      // NEW
  additionalArgs?: string[];
}
```

#### 2. Update RunClaudeIterationOptions Interface
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Location**: Lines 9-13
**Changes**: Add system prompt field

```typescript
interface RunClaudeIterationOptions {
  prompt: string;
  logFile: string;
  systemPrompt?: string;          // NEW
  additionalArgs?: string[];
}
```

#### 3. Update runClaudeIteration Function
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Location**: Lines 15-31
**Changes**: Add system prompt to Claude CLI command

After building base CMD array (after line 27), before additionalArgs (line 29):
```typescript
  // Add system prompt if provided
  if (opts.systemPrompt) {
    CMD.push("--append-system-prompt", opts.systemPrompt);
  }
```

#### 4. Add System Prompt Resolution in runWorker
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Location**: After line 164 (after isYolo initialization)
**Changes**: Add system prompt resolution logic with file reading

```typescript
  // Resolve system prompt
  let resolvedSystemPrompt: string | undefined;

  // Priority: CLI flag > env var
  const systemPromptText = opts.systemPrompt || process.env.WORKER_SYSTEM_PROMPT;
  const systemPromptFilePath = opts.systemPromptFile || process.env.WORKER_SYSTEM_PROMPT_FILE;

  if (systemPromptText) {
    resolvedSystemPrompt = systemPromptText;
    console.log(`[worker] Using system prompt from ${opts.systemPrompt ? 'CLI flag' : 'env var'}`);
  } else if (systemPromptFilePath) {
    try {
      const file = Bun.file(systemPromptFilePath);
      if (!(await file.exists())) {
        console.error(`[worker] ERROR: System prompt file not found: ${systemPromptFilePath}`);
        process.exit(1);
      }
      resolvedSystemPrompt = await file.text();
      console.log(`[worker] Loaded system prompt from file: ${systemPromptFilePath}`);
      console.log(`[worker] System prompt length: ${resolvedSystemPrompt.length} characters`);
    } catch (error) {
      console.error(`[worker] ERROR: Failed to read system prompt file: ${systemPromptFilePath}`);
      console.error(error);
      process.exit(1);
    }
  }
```

#### 5. Update Console Output
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Location**: After line 170 (after prompt logging)
**Changes**: Add system prompt status to startup logs

```typescript
  console.log(`[worker] System prompt: ${resolvedSystemPrompt ? 'provided' : 'none'}`);
```

#### 6. Pass System Prompt to Iteration
**File**: `cc-orch-mcp/src/commands/worker.ts`
**Location**: Line 193
**Changes**: Add systemPrompt to runClaudeIteration call

```typescript
    const exitCode = await runClaudeIteration({
      prompt,
      logFile,
      systemPrompt: resolvedSystemPrompt,  // NEW
      additionalArgs: opts.additionalArgs,
    });
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`
- [ ] Linting passes: `cd cc-orch-mcp && bun run lint`

#### Manual Verification:
- [ ] `echo "You are a test specialist" > /tmp/test-prompt.txt`
- [ ] `bun src/cli.tsx worker --system-prompt-file /tmp/test-prompt.txt` reads file successfully
- [ ] `bun src/cli.tsx worker --system-prompt-file /nonexistent/file.txt` exits with error
- [ ] System prompt appears in logs
- [ ] Worker continues working with system prompt applied

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that file reading works correctly.

---

## Phase 3: Docker Environment Variables

### Overview
Add environment variable declarations to Dockerfile for Docker deployments.

### Changes Required:

#### 1. Update Dockerfile Environment Variables
**File**: `cc-orch-mcp/Dockerfile.worker`
**Location**: After line 119 (after WORKER_LOG_DIR)
**Changes**: Add system prompt env vars

```dockerfile
ENV WORKER_YOLO=false
ENV MCP_BASE_URL=http://host.docker.internal:3013
ENV WORKER_LOG_DIR=/logs
ENV WORKER_SYSTEM_PROMPT=""
ENV WORKER_SYSTEM_PROMPT_FILE=""
ENV PATH="/home/worker/.local/bin:/home/worker/.bun/bin:$PATH"
```

### Success Criteria:

#### Automated Verification:
- [ ] Docker builds successfully: `cd cc-orch-mcp && docker build -f Dockerfile.worker -t test:worker .`
- [ ] Dockerfile is valid: `cd cc-orch-mcp && docker build -f Dockerfile.worker --check .`

#### Manual Verification:
- [ ] Build and run container with `-e WORKER_SYSTEM_PROMPT="test"`
- [ ] Verify system prompt is applied in container logs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for confirmation.

---

## Phase 4: Documentation and Help Text

### Overview
Update help text and add examples for new flags.

### Changes Required:

#### 1. Update Worker Options Help
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: After line 226 (after --yolo option)
**Changes**: Add documentation for new flags

```typescript
        <Box>
          <Box width={30}>
            <Text color="yellow">--system-prompt {"<text>"}</Text>
          </Box>
          <Text>Custom system prompt (appended to Claude)</Text>
        </Box>
        <Box>
          <Box width={30}>
            <Text color="yellow">--system-prompt-file {"<path>"}</Text>
          </Box>
          <Text>Read system prompt from file</Text>
        </Box>
```

Note: Update the width from 24 to 30 for all options in this section to accommodate longer flag names.

#### 2. Add Environment Variable Documentation
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: After line 288 (after WORKER_YOLO)
**Changes**: Document new env vars

```typescript
        <Box>
          <Box width={32}>
            <Text color="magenta">WORKER_SYSTEM_PROMPT</Text>
          </Box>
          <Text>Custom system prompt text</Text>
        </Box>
        <Box>
          <Box width={32}>
            <Text color="magenta">WORKER_SYSTEM_PROMPT_FILE</Text>
          </Box>
          <Text>Path to system prompt file</Text>
        </Box>
```

#### 3. Add Examples
**File**: `cc-orch-mcp/src/cli.tsx`
**Location**: After line 248 (after existing worker examples)
**Changes**: Add example usage

```typescript
        <Text dimColor> {binName} worker --system-prompt "You are a Python specialist"</Text>
        <Text dimColor> {binName} worker --system-prompt-file ./prompts/specialist.txt</Text>
```

### Success Criteria:

#### Automated Verification:
- [ ] Help renders correctly: `cd cc-orch-mcp && bun src/cli.tsx help | grep -q "system-prompt"`
- [ ] TypeScript compiles: `cd cc-orch-mcp && bun run tsc:check`

#### Manual Verification:
- [ ] `bun src/cli.tsx help` shows new flags in proper formatting
- [ ] Examples are clear and actionable

**Implementation Note**: After completing this phase, the implementation is complete.

---

## Testing Strategy

### Unit Tests:
- No unit tests needed - this is CLI/infrastructure code

### Integration Tests:

**Test 1: Direct text system prompt (CLI flag)**
```bash
cd cc-orch-mcp
bun src/cli.tsx worker --system-prompt "You are a testing specialist"
# Expected: Logs show "Using system prompt from CLI flag"
# Expected: Claude receives system prompt
```

**Test 2: File-based system prompt (CLI flag)**
```bash
cd cc-orch-mcp
echo "You are a helpful testing assistant" > /tmp/system-prompt.txt
bun src/cli.tsx worker --system-prompt-file /tmp/system-prompt.txt
# Expected: Logs show "Loaded system prompt from file"
# Expected: Logs show prompt length
```

**Test 3: Environment variable (text)**
```bash
cd cc-orch-mcp
export WORKER_SYSTEM_PROMPT="You are an env var specialist"
bun src/cli.tsx worker
# Expected: Logs show "Using system prompt from env var"
```

**Test 4: Environment variable (file)**
```bash
cd cc-orch-mcp
echo "From env var file" > /tmp/env-prompt.txt
export WORKER_SYSTEM_PROMPT_FILE=/tmp/env-prompt.txt
bun src/cli.tsx worker
# Expected: System prompt loaded from file
```

**Test 5: Priority (CLI overrides env)**
```bash
cd cc-orch-mcp
export WORKER_SYSTEM_PROMPT="From env"
bun src/cli.tsx worker --system-prompt "From CLI"
# Expected: Uses "From CLI"
```

**Test 6: File not found error**
```bash
cd cc-orch-mcp
bun src/cli.tsx worker --system-prompt-file /nonexistent/file.txt
# Expected: Error message and exit code 1
```

**Test 7: Docker deployment**
```bash
cd cc-orch-mcp
docker run --rm -it \
  -e WORKER_SYSTEM_PROMPT="Docker system prompt" \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest
# Expected: System prompt applied in Docker context
```

### Manual Testing Checklist:
- [ ] No system prompt (backward compatibility)
- [ ] CLI `--system-prompt` with text
- [ ] CLI `--system-prompt-file` with valid path
- [ ] Env `WORKER_SYSTEM_PROMPT`
- [ ] Env `WORKER_SYSTEM_PROMPT_FILE`
- [ ] CLI flag overrides env var
- [ ] File not found error is clear
- [ ] Empty file handling (treat as no prompt)
- [ ] Verify prompt in Claude's behavior/logs
- [ ] Docker container with env var

## Performance Considerations

- File reading is async and happens once at startup (not per iteration)
- No performance impact on worker loop
- System prompt size limited by Claude CLI (no explicit limit needed)

## Migration Notes

- Fully backward compatible - no breaking changes
- Existing workers continue working without modification
- New flags are optional with sensible defaults (none)

## References

- Worker implementation: `cc-orch-mcp/src/commands/worker.ts`
- CLI parsing: `cc-orch-mcp/src/cli.tsx`
- Claude CLI documentation: `--append-system-prompt` flag
- Docker configuration: `cc-orch-mcp/Dockerfile.worker`
