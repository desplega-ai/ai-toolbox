# Auto-Instrument Business-Use SDK

Analyze the codebase and automatically add Business-Use SDK instrumentation to track critical business flows.

## SDK Installation & Setup

### Python SDK

```bash
pip install business-use
```

**Initialization:**
```python
from business_use import initialize, ensure

# Initialize once at application startup
# Recommended: Use environment variables
# Set BUSINESS_USE_API_KEY and BUSINESS_USE_URL in your environment
initialize()  # Automatically uses env vars

# Or with explicit parameters (overrides env vars)
initialize(api_key="your-api-key", url="http://localhost:13370")

# Track events with ensure()
ensure(
    id="event_name",
    flow="flow_name",
    run_id="run_id",
    data={"key": "value"},
    dep_ids=["upstream_event"],  # Optional
    validator=lambda data, ctx: True  # Optional, for assertions
)
```

**Environment Variables (Recommended):**
```bash
export BUSINESS_USE_API_KEY="your-api-key"
export BUSINESS_USE_URL="http://localhost:13370"  # Optional, defaults to http://localhost:13370
```

### JavaScript/TypeScript SDK

```bash
npm i @desplega.ai/business-use
```

**Initialization:**
```typescript
import { initialize, ensure } from '@desplega.ai/business-use';

// Initialize once at application startup
// Recommended: Use environment variables
// Set BUSINESS_USE_API_KEY and BUSINESS_USE_URL in your environment
initialize();  // Automatically uses env vars

// Or with explicit parameters (overrides env vars)
initialize({ apiKey: 'your-api-key', url: 'http://localhost:13370' });

// Track events with ensure()
ensure({
  id: 'event_name',
  flow: 'flow_name',
  runId: 'run_id',
  data: { key: 'value' },
  depIds: ['upstream_event'], // Optional
  validator: (data, ctx) => true // Optional, for assertions
});
```

**Environment Variables (Recommended):**
```bash
export BUSINESS_USE_API_KEY="your-api-key"
export BUSINESS_USE_URL="http://localhost:13370"  # Optional, defaults to http://localhost:13370
```

## Your Task

You will analyze this codebase to identify business flows that would benefit from tracking and validation. Then you'll propose where to add Business-Use instrumentation.

## Step 1: Understand the Business Context

**First, ask the user:**

1. **What does this application do?** (e.g., e-commerce, SaaS platform, content management, etc.)
2. **What are the most critical user journeys?** (e.g., purchasing, signing up, publishing content)
3. **What flows cause the most issues/support tickets?** (These are high-priority candidates)
4. **Are there any flows with strict ordering requirements?** (Events must happen in sequence)
5. **Where do business rules need validation?** (e.g., totals must match, status checks, permissions)

**Wait for the user to provide this context before proceeding.**

## Step 2: Analyze the Codebase

Once you understand the business context, search for:

### Service/Business Logic Layers
Look for:
- Files in `services/`, `domain/`, `business/`, `use-cases/` directories
- Classes/modules with business logic (not controllers/routes)
- Functions representing key operations

### Multi-Step Processes
Identify functions that:
- Call multiple other functions in sequence
- Have conditional logic based on business rules
- Update state across multiple entities
- Trigger side effects (emails, webhooks, external APIs)

### Validation Points
Find where:
- Business rules are checked (if amount > 0, if status == X)
- Data is validated before proceeding
- Assertions are made about state

## Step 3: Propose Flow Structures

For each identified flow, present it as:

**Example:**
```
Flow: user_journey_name
------------------------------------------------------------
  [○] step_initiated
   │
   ↓ (depends on: step_initiated)
  [○] intermediate_action
   │
   ↓ (depends on: intermediate_action)
  [✓] validation_point (validator: business_rule_here)
   │
   ↓ (depends on: validation_point)
  [○] flow_completed
------------------------------------------------------------
```

**Ask the user:**
- "Does this flow structure match your understanding?"
- "Are there any steps I'm missing?"
- "Should any of these steps have validators for business rules?"

## Step 4: Show Implementation Examples

For each function you want to instrument, show:

### Before (Original Code)
```python
def critical_business_operation(id: str, data: dict):
    # Existing business logic
    result = some_operation(data)
    if result.is_valid:
        update_state(id, result)
    return result
```

### After (With Business-Use)
```python
from business_use import ensure

def critical_business_operation(id: str, data: dict):
    # Existing business logic
    result = some_operation(data)

    # Track with Business-Use
    ensure(
        id="operation_completed",
        flow="business_flow_name",
        run_id=id,
        data={
            "result": result.to_dict(),
            "is_valid": result.is_valid
        },
        dep_ids=["previous_step"],  # If there's a dependency
        validator=lambda data, ctx: data["is_valid"] == True,  # If validation needed
        description="Critical operation completed and validated"
    )

    if result.is_valid:
        update_state(id, result)
    return result
```

**Ask the user:**
- "Does this placement make sense?"
- "What data should we include for debugging?"
- "Are there any business rules I should add as validators?"

## Step 5: Generate Setup Instructions

Provide:

1. **SDK Installation** (reference the installation commands at the top of this file)
2. **Initialization code** with recommended location in codebase
   - For Python: typically in `main.py`, `app.py`, or application entry point
   - For JavaScript: typically in `index.ts`, `main.ts`, or app initialization file
3. **Backend Setup** (required - runs as separate service):
   ```bash
   # Option 1: With uvx (no install required - recommended)
   uvx business-use-core init        # Interactive setup (generates API key, creates config, initializes DB)
   uvx business-use-core serve       # Start backend server

   # Option 2: Install globally (cleaner commands)
   pip install business-use-core
   business-use init                 # Interactive setup
   business-use serve                # Start backend server (or `business-use prod` for production)
   ```

   **Note**: The backend runs as a separate service that your application sends events to. It is NOT part of your application code.
4. **List of files to modify** with specific instrumentation points
5. **Testing instructions** using the validation commands

**Ask the user:**
- "Do you want me to proceed with implementing these changes?"
- "Should I start with one flow as a proof-of-concept?"

## Guidelines for Analysis

### DO ✅
- Focus on **business outcomes**, not technical implementation
- Track at the **service/domain layer**
- Use **descriptive, generic node IDs** (action_completed, validation_passed)
- Ask questions when business logic is unclear
- Prioritize flows based on user input
- Propose validators for business rule checkpoints

### DON'T ❌
- Make assumptions about business importance
- Track low-level technical details (DB queries, cache hits)
- Use hardcoded examples (like "payment_processed") without user context
- Instrument without understanding the flow's purpose
- Add instrumentation in controllers/HTTP handlers
- Proceed without user confirmation

## Example Interaction Flow

**You:** "I've analyzed the codebase and found several potential business flows. Before I propose instrumentation, can you help me understand:

1. What is the primary purpose of this application?
2. What are the top 3 most critical user journeys?
3. Are there any flows where things frequently go wrong or require debugging?

This will help me prioritize which flows to instrument first."

**User:** [Provides context]

**You:** "Thanks! Based on your input, I've identified these flows:

1. **[Flow Name]** in `src/services/flow.py` - [brief description]
2. **[Flow Name]** in `src/services/other.py` - [brief description]

Here's the proposed structure for Flow 1:
[Show flow diagram]

Does this match your understanding? Should I add validators for [specific business rule]?"

**User:** [Confirms or provides feedback]

**You:** "Great! Here's how I'll instrument this flow:
[Show before/after code]

Shall I proceed with implementing this across the codebase?"

## Validation Commands to Provide

After instrumentation, show users how to validate:

**With uvx (no install required - recommended):**
```bash
# Evaluate a specific flow run
uvx business-use-core eval-run <run_id> <flow_name> --verbose

# Visualize the flow structure with actual event data
uvx business-use-core eval-run <run_id> <flow_name> --show-graph

# Combine graph + verbose for complete picture
uvx business-use-core eval-run <run_id> <flow_name> -g -v

# Get JSON output for automation/CI pipelines
uvx business-use-core eval-run <run_id> <flow_name> --json-output

# View the flow definition (without evaluation)
uvx business-use-core show-graph <flow_name>

# List all runs for a specific flow
uvx business-use-core runs --flow <flow_name>
```

**After global installation (shorter commands):**
```bash
# Install backend globally
pip install business-use-core

# Now use the shorter command everywhere
business-use eval-run <run_id> <flow_name> --verbose
business-use eval-run <run_id> <flow_name> --show-graph
business-use show-graph <flow_name>
business-use runs --flow <flow_name>
```

**Backend Setup Commands:**
```bash
# First-time setup (interactive - recommended)
uvx business-use-core init        # Generates API key, creates config, initializes DB
# OR if installed globally:
business-use init

# Start development server (with auto-reload)
uvx business-use-core serve --reload
# OR:
business-use serve --reload

# Start production server (4 workers)
uvx business-use-core prod
# OR:
business-use prod
```

## Key Questions to Ask

Throughout the process, ask:

1. **Business Context**: "What business problem does this flow solve?"
2. **Success Criteria**: "How do you know this flow succeeded?"
3. **Failure Modes**: "What typically goes wrong in this flow?"
4. **Validation Rules**: "What business rules must be enforced?"
5. **Dependencies**: "Must any steps happen before others?"
6. **Data Context**: "What data is important for debugging this flow?"

## Remember

- **Never assume** business importance - always ask
- **Use generic examples** in explanations (avoid specific domains unless confirmed)
- **Wait for user confirmation** before making changes
- **Prioritize based on user input**, not your assumptions
- **Ask clarifying questions** when the business logic is unclear

---

Ready! Please provide:
1. A brief description of what this application does
2. Which business flows are most critical to track

Then I'll analyze the codebase and propose instrumentation.
