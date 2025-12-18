# Startup Script Support Implementation Plan

## Overview

Add support for executing startup scripts before launching the worker in Docker containers. This enables initialization tasks like dependency installation, environment configuration, and pre-flight checks.

## Current State Analysis

### Docker Architecture
- **Entry Point**: `docker-entrypoint.sh` - validates env vars, creates `.mcp.json`, launches agent (worker or lead)
- **Dockerfile**: `Dockerfile.worker` - multi-stage build with Ubuntu 24.04, Claude CLI, and dev tools
- **Startup Sequence**:
  1. Validate `CLAUDE_CODE_OAUTH_TOKEN` and `API_KEY`
  2. Detect role (`AGENT_ROLE` defaults to "worker", can be "lead")
  3. Create MCP configuration in `/workspace/.mcp.json`
  4. Execute agent binary: `/usr/local/bin/agent-swarm "$ROLE" "$@"`

### Key Discoveries:
- `docker-entrypoint.sh:5-13` - Environment variable validation
- `docker-entrypoint.sh:15-24` - Role detection (worker/lead) and YOLO mode
- `docker-entrypoint.sh:34-65` - MCP config generation
- `docker-entrypoint.sh:67-69` - Agent launch (role-agnostic)
- `Dockerfile.worker:58-62` - Worker user has passwordless sudo
- `/workspace` is the working directory with proper permissions

## Desired End State

After implementation:
1. Startup scripts can be placed at `/workspace/start-up.*` with various extensions (.sh, .js, .ts, .bun)
2. Scripts are auto-detected and executed before worker starts
3. Shebang detection automatically selects the correct interpreter
4. Extension-based inference as fallback (no shebang)
5. Configurable error handling via `STARTUP_SCRIPT_STRICT` env var (default: true)
6. Clear logging of script execution and results

### Verification:
- Create `/workspace/start-up.sh` → Script executes on container start
- Script with `#!/usr/bin/env node` → Executes with Node.js
- Script fails + `STARTUP_SCRIPT_STRICT=true` → Container exits with script's exit code
- Script fails + `STARTUP_SCRIPT_STRICT=false` → Warning logged, worker continues
- No script found → Silent continue (backward compatible)

## What We're NOT Doing

- Modifying the worker command or MCP server
- Adding timeout handling for hung scripts (user's responsibility)
- Supporting multiple scripts execution (only first match runs)
- Adding script validation or sandboxing beyond user permissions
- Creating a scripting API or hooks system

## Implementation Approach

1. Add startup script detection logic to docker-entrypoint.sh
2. Implement shebang parsing and interpreter detection
3. Add extension-based fallback for scripts without shebangs
4. Implement configurable error handling
5. Update Dockerfile with new environment variable
6. Document the feature with examples

## Phase 1: Startup Script Detection

### Overview
Add logic to detect and identify startup scripts in the /workspace directory.

### Changes Required:

#### 1. Update docker-entrypoint.sh
**File**: `cc-orch-mcp/docker-entrypoint.sh`
**Location**: After line 65 (after .mcp.json creation), before line 67 (agent launch)
**Changes**: Add startup script detection section

```bash
# Execute startup script if found
STARTUP_SCRIPT_STRICT="${STARTUP_SCRIPT_STRICT:-true}"
echo ""
echo "=== Startup Script Detection (${ROLE}) ==="

# Find startup script matching /workspace/start-up.* pattern
STARTUP_SCRIPT=""
for pattern in start-up.sh start-up.bash start-up.js start-up.ts start-up.bun start-up; do
    if [ -f "/workspace/${pattern}" ]; then
        STARTUP_SCRIPT="/workspace/${pattern}"
        break
    fi
done

if [ -n "$STARTUP_SCRIPT" ]; then
    echo "Found startup script: $STARTUP_SCRIPT"
else
    echo "No startup script found (looked for /workspace/start-up.*)"
    echo "Skipping startup script execution"
fi

echo "==============================="
echo ""
```

### Success Criteria:

#### Automated Verification:
- [x] Syntax check: `bash -n cc-orch-mcp/docker-entrypoint.sh`
- [x] Shellcheck passes: `shellcheck cc-orch-mcp/docker-entrypoint.sh` (not installed locally)

#### Manual Verification:
- [ ] Build Docker image and run without script → Shows "No startup script found"
- [ ] Create `/workspace/start-up.sh` and run → Shows "Found startup script"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for confirmation.

---

## Phase 2: Script Execution Logic

### Overview
Implement shebang detection, interpreter inference, and script execution.

### Changes Required:

#### 1. Add Script Execution Logic
**File**: `cc-orch-mcp/docker-entrypoint.sh`
**Location**: After the detection logic added in Phase 1, inside the `if [ -n "$STARTUP_SCRIPT" ]` block (before line 67 agent launch)
**Changes**: Add execution logic with shebang and extension handling

Replace the simple echo with:
```bash
if [ -n "$STARTUP_SCRIPT" ]; then
    echo "Found startup script: $STARTUP_SCRIPT"

    # Check if file is executable
    if [ ! -x "$STARTUP_SCRIPT" ]; then
        echo "Script is not executable, checking for shebang..."
    fi

    # Read first line to check for shebang
    FIRST_LINE=$(head -n 1 "$STARTUP_SCRIPT")

    if [[ "$FIRST_LINE" =~ ^#! ]]; then
        # Has shebang
        INTERPRETER="${FIRST_LINE#\#!}"
        # Trim whitespace
        INTERPRETER=$(echo "$INTERPRETER" | xargs)
        echo "Detected shebang interpreter: $INTERPRETER"

        # Check if it's an env-based shebang (#!/usr/bin/env bash)
        if [[ "$INTERPRETER" =~ ^/usr/bin/env ]]; then
            ACTUAL_INTERPRETER=$(echo "$INTERPRETER" | awk '{print $2}')
            echo "Using env interpreter: $ACTUAL_INTERPRETER"
            INTERPRETER="$ACTUAL_INTERPRETER"
        fi

        echo "Executing startup script with detected interpreter..."
        if [ -x "$STARTUP_SCRIPT" ]; then
            "$STARTUP_SCRIPT"
        else
            $INTERPRETER "$STARTUP_SCRIPT"
        fi
        EXIT_CODE=$?
    else
        # No shebang, try to infer from extension
        EXTENSION="${STARTUP_SCRIPT##*.}"
        echo "No shebang found, inferring from extension: .$EXTENSION"

        case "$EXTENSION" in
            sh|bash)
                echo "Executing with bash..."
                bash "$STARTUP_SCRIPT"
                EXIT_CODE=$?
                ;;
            js)
                echo "Executing with node..."
                node "$STARTUP_SCRIPT"
                EXIT_CODE=$?
                ;;
            ts)
                echo "Executing with bun (TypeScript)..."
                bun run "$STARTUP_SCRIPT"
                EXIT_CODE=$?
                ;;
            bun)
                echo "Executing with bun..."
                bun run "$STARTUP_SCRIPT"
                EXIT_CODE=$?
                ;;
            *)
                # Try to execute directly if executable
                if [ -x "$STARTUP_SCRIPT" ]; then
                    echo "Executing directly (executable bit set)..."
                    "$STARTUP_SCRIPT"
                    EXIT_CODE=$?
                else
                    echo "WARNING: Unknown extension and not executable, trying bash..."
                    bash "$STARTUP_SCRIPT"
                    EXIT_CODE=$?
                fi
                ;;
        esac
    fi
```

### Success Criteria:

#### Automated Verification:
- [x] Syntax check: `bash -n cc-orch-mcp/docker-entrypoint.sh`
- [x] Shellcheck passes: `shellcheck cc-orch-mcp/docker-entrypoint.sh` (not installed locally)

#### Manual Verification:
- [ ] Create bash script with shebang → Executes with bash
- [ ] Create node script with `#!/usr/bin/env node` → Executes with node
- [ ] Create script without shebang but `.js` extension → Uses node
- [ ] Create executable script → Executes directly

**Implementation Note**: After completing this phase and verification passes, pause for confirmation.

---

## Phase 3: Error Handling

### Overview
Implement configurable error handling based on STARTUP_SCRIPT_STRICT environment variable.

### Changes Required:

#### 1. Add Error Handling Logic
**File**: `cc-orch-mcp/docker-entrypoint.sh`
**Location**: After the execution logic added in Phase 2
**Changes**: Handle exit codes with strict/permissive modes

```bash
    # Handle exit code
    if [ $EXIT_CODE -ne 0 ]; then
        echo ""
        echo "ERROR: Startup script failed with exit code $EXIT_CODE"

        if [ "$STARTUP_SCRIPT_STRICT" = "true" ]; then
            echo "STARTUP_SCRIPT_STRICT=true - Exiting..."
            exit $EXIT_CODE
        else
            echo "STARTUP_SCRIPT_STRICT=false - Continuing despite error..."
        fi
    else
        echo "Startup script completed successfully"
    fi
```

### Success Criteria:

#### Automated Verification:
- [x] Syntax check: `bash -n cc-orch-mcp/docker-entrypoint.sh`
- [x] Shellcheck passes: `shellcheck cc-orch-mcp/docker-entrypoint.sh` (not installed locally)

#### Manual Verification:
- [ ] Create script with `exit 1` + strict mode → Container exits
- [ ] Create script with `exit 1` + permissive mode → Worker continues
- [ ] Create successful script → Worker starts normally

**Implementation Note**: After completing this phase, pause for confirmation.

---

## Phase 4: Docker Environment Variable

### Overview
Add STARTUP_SCRIPT_STRICT environment variable to Dockerfile.

### Changes Required:

#### 1. Update Dockerfile Environment Variables
**File**: `cc-orch-mcp/Dockerfile.worker`
**Location**: After line 125 (after LEAD_SYSTEM_PROMPT_FILE), before PATH
**Changes**: Add startup script configuration

```dockerfile
ENV WORKER_SYSTEM_PROMPT=""
ENV WORKER_SYSTEM_PROMPT_FILE=""
ENV LEAD_SYSTEM_PROMPT=""
ENV LEAD_SYSTEM_PROMPT_FILE=""
ENV STARTUP_SCRIPT_STRICT=true
ENV PATH="/home/worker/.local/bin:/home/worker/.bun/bin:$PATH"
```

### Success Criteria:

#### Automated Verification:
- [x] Docker builds successfully: `cd cc-orch-mcp && docker build -f Dockerfile.worker -t test:worker .`
- [x] Dockerfile is valid: `cd cc-orch-mcp && docker build -f Dockerfile.worker --check .`

#### Manual Verification:
- [ ] Build and run with default (strict mode)
- [ ] Build and run with `-e STARTUP_SCRIPT_STRICT=false`

**Implementation Note**: After completing this phase, the implementation is complete.

---

## Testing Strategy

### Integration Tests:

**Test 1: Basic bash script**
```bash
# Create test script
cat > /tmp/workspace/start-up.sh << 'EOF'
#!/bin/bash
echo "Startup script running..."
echo "Working directory: $(pwd)"
echo "User: $(whoami)"
EOF

# Run container
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Script output in logs, worker starts
```

**Test 2: Node.js script**
```bash
cat > /tmp/workspace/start-up.js << 'EOF'
#!/usr/bin/env node
console.log("Installing dependencies...");
console.log("Node version:", process.version);
EOF

# Run container
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Node.js executes script
```

**Test 3: TypeScript with Bun**
```bash
cat > /tmp/workspace/start-up.ts << 'EOF'
#!/usr/bin/env bun
console.log("TypeScript startup running...");
await Bun.write("/workspace/startup-complete.txt", "Done");
EOF

# Run container
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Bun executes TypeScript, file created
```

**Test 4: Script without shebang**
```bash
cat > /tmp/workspace/start-up.js << 'EOF'
console.log("No shebang, extension-based detection");
EOF

# Run container (same as above)
# Expected: Node.js inferred from .js extension
```

**Test 5: Error handling (strict mode)**
```bash
cat > /tmp/workspace/start-up.sh << 'EOF'
#!/bin/bash
echo "Script will fail..."
exit 1
EOF

# Run with strict mode (default)
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e STARTUP_SCRIPT_STRICT=true \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Container exits with code 1, worker doesn't start
```

**Test 6: Error handling (permissive mode)**
```bash
# Same script as Test 5

# Run with permissive mode
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e STARTUP_SCRIPT_STRICT=false \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Warning logged, worker continues and starts
```

**Test 7: Package installation**
```bash
cat > /tmp/workspace/start-up.sh << 'EOF'
#!/bin/bash
echo "Installing custom packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq tree
tree --version
echo "Package installation complete"
EOF

# Run container
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Packages installed, tree command works
```

**Test 8: No startup script (backward compatibility)**
```bash
# Don't create any startup script

docker run --rm -it \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: "No startup script found", worker starts normally
```

**Test 9: Multiple scripts (priority order)**
```bash
# Create multiple scripts
echo '#!/bin/bash\necho "This is start-up.sh"' > /tmp/workspace/start-up.sh
echo '#!/usr/bin/env node\nconsole.log("This is start-up.js")' > /tmp/workspace/start-up.js

# Run container
docker run --rm -it \
  -v /tmp/workspace:/workspace \
  -e CLAUDE_CODE_OAUTH_TOKEN="..." \
  -e API_KEY="..." \
  agent-swarm-worker:latest

# Expected: Only start-up.sh executes (first in priority order)
```

### Manual Testing Checklist:
- [ ] No startup script (backward compatibility)
- [ ] Bash script with shebang
- [ ] Node.js script with shebang
- [ ] TypeScript/Bun script
- [ ] Script without shebang (extension-based)
- [ ] Script failure + strict mode
- [ ] Script failure + permissive mode
- [ ] Package installation with sudo
- [ ] Multiple scripts (first match wins)
- [ ] Script with complex logic (loops, conditions)
- [ ] Script output visible in Docker logs

## Performance Considerations

- Startup script executes once at container start (not per iteration)
- No performance impact on worker loop
- Script execution time adds to container startup time
- Users responsible for script performance/hangs (no timeout implemented)

## Security Considerations

- Scripts run as `worker` user (not root)
- Worker has passwordless sudo for package installation
- Only `/workspace/start-up.*` pattern accepted (no path traversal)
- Scripts inherit all environment variables (including secrets)
- Users control `/workspace` content (expected)

**Recommendations**:
- Document that startup scripts should be in `.gitignore` if they contain secrets
- Encourage using env vars for configuration
- Log all execution attempts for security auditing

## Migration Notes

- Fully backward compatible - no breaking changes
- Existing containers continue working without modification
- Silent skip if no startup script found
- Default strict mode prevents silent failures

## Example Startup Scripts

### Example 1: Install Dependencies
```bash
#!/bin/bash
# /workspace/start-up.sh

echo "Installing project dependencies..."
if [ -f "package.json" ]; then
    bun install
fi

if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
fi

echo "Dependencies installed successfully"
```

### Example 2: Environment Setup
```bash
#!/bin/bash
# /workspace/start-up.sh

echo "Setting up development environment..."

# Install additional tools
sudo apt-get update -qq
sudo apt-get install -y -qq ripgrep fd-find

# Create necessary directories
mkdir -p .cache logs temp

# Set git config
git config --global user.name "${GIT_USER_NAME:-Agent}"
git config --global user.email "${GIT_USER_EMAIL:-agent@example.com}"

echo "Environment setup complete"
```

### Example 3: Pre-flight Checks
```bash
#!/bin/bash
# /workspace/start-up.sh

echo "Running pre-flight checks..."

# Check if required files exist
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found"
    exit 1
fi

# Verify API connectivity
if ! curl -s "${API_ENDPOINT}/health" > /dev/null; then
    echo "ERROR: Cannot reach API endpoint"
    exit 1
fi

echo "All checks passed"
```

### Example 4: TypeScript Setup
```typescript
#!/usr/bin/env bun
// /workspace/start-up.ts

console.log("Running TypeScript startup script...");

// Install dependencies
await Bun.$`bun install`;

// Create directories
await Bun.write("logs/.gitkeep", "");

// Verify environment
const requiredEnvVars = ["API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`ERROR: ${envVar} not set`);
    process.exit(1);
  }
}

console.log("Startup complete!");
```

## References

- Docker entrypoint: `cc-orch-mcp/docker-entrypoint.sh`
- Worker Dockerfile: `cc-orch-mcp/Dockerfile.worker`
- Worker user permissions: Dockerfile.worker:58-62 (sudo access)
- Working directory: `/workspace` with proper permissions
