# Swarm Status

Get a quick overview of the agent swarm state.

## Process:

1. **Get swarm membership:**
   - Use `get-swarm` MCP tool to list all agents
   - Show agent names, status, and current tasks

2. **Get task overview:**
   - Use `get-tasks` MCP tool to list recent tasks
   - Summarize by status (pending, in_progress, completed, failed, blocked)

3. **Present a compact summary:**
   ```
   Swarm Status
   ============
   Agents: [N] total ([X] active, [Y] idle)
   - agent-1: working on "Task title"
   - agent-2: idle

   Tasks: [N] total
   - Pending: [X]
   - In Progress: [Y]
   - Completed: [Z]
   - Failed: [W]
   ```

## Notes:
- If not joined to swarm, prompt user to join first
- Keep output concise - this is a quick check
