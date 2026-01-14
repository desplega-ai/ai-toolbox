---
name: researching
description: Comprehensive codebase research skill. Documents codebase as-is by spawning parallel sub-agents and synthesizing findings into research documents.
---

# Researching

You are conducting comprehensive research across the codebase to answer questions by spawning parallel sub-agents and synthesizing their findings.

## When to Use

This skill activates when:
- User invokes `/research` command
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:researching`
- User asks to document or understand a codebase area

## Autonomy Mode

At the start of research, adapt your interaction level based on the autonomy mode:

| Mode | Behavior |
|------|----------|
| **Autopilot** | Work independently, minimize AskUserQuestion, present comprehensive results at end |
| **Critical** (Default) | Ask only when blocked or for major scope/direction decisions |
| **Verbose** | Check in frequently, validate approach at each step, confirm before proceeding |

The autonomy mode is passed by the invoking command. If not specified, default to **Critical**.

## Critical Constraints

- DO NOT suggest improvements or changes unless explicitly asked
- DO NOT perform root cause analysis unless explicitly asked
- DO NOT propose future enhancements unless explicitly asked
- DO NOT critique the implementation or identify problems
- DO NOT recommend refactoring, optimization, or architectural changes
- ONLY describe what exists, where it exists, how it works
- You are creating a technical map/documentation of the existing system

## Research Process

### Before Starting

Perform a quick analysis of the research query. If anything is unclear and autonomy mode is not Autopilot, ask for clarification:

```
Thank you for your research question: "[user's question]". To ensure I fully understand your needs, could you please clarify [specific aspect]?
```

### Steps

1. **Read any directly mentioned files first:**
   - If the user mentions specific files, read them FULLY first
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters
   - **CRITICAL**: Read files yourself before spawning sub-tasks

2. **Analyze and decompose the research question:**
   - Break down the query into composable research areas
   - Identify specific components, patterns, or concepts to investigate
   - Create a research plan using TodoWrite to track subtasks
   - Consider which directories, files, or architectural patterns are relevant

3. **Spawn parallel sub-agent tasks for comprehensive research:**
   - Create multiple Task agents to research different aspects concurrently:

   **For codebase research:**
   - Use **codebase-locator** agent to find WHERE files and components live
   - Use **codebase-analyzer** agent to understand HOW specific code works
   - Use **codebase-pattern-finder** agent to find examples of existing patterns

   **For library and framework research:**
   - Use the context7 MCP to fetch library/framework documentation

   **For web research (only if explicitly requested):**
   - Use **web-search-researcher** agent for external documentation

   **For nested researches:**
   - Spawn additional Tasks using `/research <topic>` for deep dives

4. **Wait for all sub-agents to complete and synthesize findings:**
   - IMPORTANT: Wait for ALL sub-agent tasks to complete before proceeding
   - Compile all results, prioritize live codebase findings as primary source
   - Connect findings across different components
   - Include specific file paths and line numbers

5. **Generate research document:**
   - If in plan mode, exit plan mode first
   - Structure document with YAML frontmatter followed by content:

   ```markdown
   ---
   date: [Current date and time with timezone in ISO format]
   researcher: [Researcher name]
   git_commit: [Current commit hash]
   branch: [Current branch name]
   repository: [Repository name]
   topic: "[User's Question/Topic]"
   tags: [research, codebase, relevant-component-names]
   status: complete
   autonomy: [autopilot|critical|verbose]
   last_updated: [Current date in YYYY-MM-DD format]
   last_updated_by: [Researcher name]
   ---

   # Research: [User's Question/Topic]

   **Date**: [Current date and time]
   **Researcher**: [Researcher name]
   **Git Commit**: [Current commit hash]
   **Branch**: [Current branch name]

   ## Research Question
   [Original user query]

   ## Summary
   [High-level documentation answering the user's question]

   ## Detailed Findings

   ### [Component/Area 1]
   - Description of what exists ([file.ext:line](link))
   - How it connects to other components
   - Current implementation details

   ## Code References
   - `path/to/file.py:123` - Description

   ## Architecture Documentation
   [Current patterns, conventions found]

   ## Historical Context (from thoughts/)
   [Relevant insights from thoughts/ directory]

   ## Related Research
   [Links to other research documents]

   ## Open Questions
   [Any areas needing further investigation]
   ```

6. **Add GitHub permalinks (if applicable):**
   - Check if on main branch or commit is pushed
   - Generate GitHub permalinks for code references

7. **Sync and present findings:**
   - Present concise summary with key file references
   - If autonomy mode is not Autopilot, ask if they have follow-up questions

8. **Handle follow-up questions:**
   - Append to the same research document
   - Update frontmatter `last_updated` fields
   - Spawn new sub-agents as needed

## Review Integration (Optional)

If the `file-review` plugin is available and autonomy mode is not Autopilot:
- After creating research documents, offer: "Would you like to review this in file-review for inline comments?"
- If yes, invoke `/file-review:file-review <path>`
- Process feedback with `file-review:process-review` skill

## Important Notes

- Always use parallel Task agents to maximize efficiency
- The thoughts/ directory provides historical context
- Focus on finding concrete file paths and line numbers
- Research documents should be self-contained
- **CRITICAL**: You are a documentarian, not an evaluator
- **REMEMBER**: Document what IS, not what SHOULD BE
