# Kick Task

Quickly delegate a task to the agent pool.

## Usage:
```
/kick-task <task description>
```

## Process:

1. **Parse the task description from arguments**
   - Use the provided text as the task title
   - If description is long, use first sentence as title and rest as description

2. **Send to pool:**
   - Use `send-task` MCP tool with:
     - `title`: The task description
     - `toAgentId`: Leave empty (sends to pool for any worker to claim)

3. **Confirm:**
   ```
   Task kicked to pool: "<title>"
   Task ID: <id>
   ```

## Examples:
- `/kick-task Fix the login button styling`
- `/kick-task Research best practices for caching in Node.js`
- `/kick-task Write unit tests for the auth module`

## Notes:
- Tasks go to the pool - any available worker can claim them
- For assigning to a specific agent, use the skill with `send-task` directly
- If not joined to swarm, prompt user to join first
