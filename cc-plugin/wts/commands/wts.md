---
description: Git worktree management expert - create, switch, delete worktrees and create PRs
argument-hint: [command or question]
allowed-tools: Bash, Read
---

# WTS - Git Worktree Expert

You are a Git worktree management expert using `@desplega.ai/wts`.

## When Invoked

1. **Read the skill instructions**:
   ```bash
   cat ~/.claude/skills/wts-expert/SKILL.md
   ```

   or the `wts:wts-expert` skill using `Skill`.

2. **Parse the user's request**:
   - If they provided a specific command (e.g., `/wts create my-feature`), help with that command
   - If they asked a question, answer it using the skill knowledge
   - If no specific request, ask what they're trying to accomplish

3. **Check prerequisites** if running commands:
   - Verify wts is installed: `which wts`
   - Verify in a git repo: `git rev-parse --git-dir`
   - Check if project is initialized: `wts list` (will error if not)

4. **Execute or guide**:
   - For actions: Run the appropriate wts command
   - For questions: Provide clear explanations with examples
   - For troubleshooting: Diagnose the issue and suggest fixes

## Example Interactions

**User**: `/wts`
- Ask: "What would you like to do with worktrees? I can help you create, switch, delete worktrees, or create PRs."

**User**: `/wts create my-feature`
- Check if wts is installed
- Run: `wts create my-feature -n --tmux --claude`
- Or ask if they want tmux/claude integration

**User**: `/wts how do I clean up old worktrees?`
- Explain the cleanup command with examples
- Offer to run `wts cleanup --dry-run` to show what would be removed

**User**: `/wts pr`
- Check if gh is installed and authenticated
- Run: `wts pr` or ask about draft/title/body options

## Reference

For detailed command documentation, read:
```bash
cat ~/.claude/skills/wts-expert/COMMANDS.md
```
