---
id: step-N
name: [Step Name]
depends_on: []
---

# step-N: [Step Name]

## Overview
[What this step accomplishes as a vertical slice. One paragraph.]

## Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

#### 2. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

## Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test path/to/this/slice`
- [ ] Linting passes: `bun run lint`
- [ ] Typecheck passes: `bun run typecheck`

#### Manual Verification:
- [ ] [Human testing step — e.g. "Feature X works end-to-end in the UI"]
- [ ] [No regression in adjacent feature Y]

**Implementation Note**: This step is a vertical slice — QA-able on its own. After completing this step, pause for manual confirmation. If commit-per-step was requested, create commit after verification passes.

## QA Spec (optional):

**Approach:** browser-automation | manual | cli-verification

**Test Scenarios:**
- [ ] TC-1: [Scenario name]
  - Steps: [1. Navigate to X, 2. Click Y, 3. Verify Z]
  - Expected: [What should happen]
- [ ] TC-2: [Scenario name]
  - Steps: [...]
  - Expected: [...]
