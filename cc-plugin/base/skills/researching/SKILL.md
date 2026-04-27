---
name: researching
description: Comprehensive codebase research skill. Documents codebase as-is by spawning parallel sub-agents and synthesizing findings into research documents.
---

# Researching

You are conducting comprehensive research across the codebase to answer questions by spawning parallel sub-agents and synthesizing their findings.

## Working Agreement

**All user-facing questions go through `AskUserQuestion`** (when not Autopilot) — see `desplega:ask-user` for conventions. Never ask in chat as plain bullets.

**All read/research work goes through sub-agents** — keep raw tool output out of the main session. Default to `run_in_background: true`.

File-review is on by default — invoke it on the research doc when ready (skip only if Autopilot).

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

### Prior Learning Recall

**OPTIONAL SUB-SKILL:** If `~/.agentic-learnings.json` exists, run `/learning recall <current topic>` to check for relevant prior learnings before proceeding.

### Before Starting

Perform a quick analysis of the research query. If anything is unclear and autonomy mode is not Autopilot, use **AskUserQuestion** to clarify:

| Question | Options |
|----------|---------|
| "Thank you for your research question: '[user's question]'. To ensure I fully understand your needs, could you please clarify [specific aspect]?" | Provide relevant options based on the specific clarification needed |

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
   - Write to `thoughts/<username|shared>/research/YYYY-MM-DD-topic.md`
   - **Path selection:** Use the user's name (e.g., `thoughts/taras/research/`) if known from context. Fall back to `thoughts/shared/research/` when unclear.

   **Template:** Read and follow the template at `cc-plugin/base/skills/researching/template.md`

   The template includes:
   - YAML frontmatter with metadata (date, researcher, git info, tags, status)
   - Standard sections (Research Question, Summary, Detailed Findings, Code References, etc.)
   - Proper formatting for file:line references

6. **Add GitHub permalinks (if applicable):**
   - Check if on main branch or commit is pushed
   - Generate GitHub permalinks for code references

7. **Sync and present findings:**
   - Present concise summary with key file references
   - If autonomy mode is not Autopilot, ask if they have follow-up questions

8. **Offer structured review:**
   - After presenting findings, offer: "Would you like me to run `/review` on this research document for a structured quality check?"
   - If yes, invoke the `desplega:reviewing` skill on the research document

9. **Handle follow-up questions:**
   - Append to the same research document
   - Update frontmatter `last_updated` fields
   - Spawn new sub-agents as needed

10. **Learning Capture:**

    **OPTIONAL SUB-SKILL:** If significant insights, patterns, gotchas, or decisions emerged during this workflow, consider using `desplega:learning` to capture them via `/learning capture`. Focus on learnings that would help someone else in a future session.

11. **Workflow handoff:**
    After research is complete (and optionally reviewed), use **AskUserQuestion** with:

    | Question | Options |
    |----------|---------|
    | "Research is complete. What's the next step?" | 1. Create a plan based on this research (→ `/create-plan`), 2. Run a review first (→ `/review`), 3. Done for now |

    Based on the answer:
    - **Plan**: Suggest the `/create-plan` command with the research file as input context
    - **Review**: Invoke the `desplega:reviewing` skill on the research document
    - **Done**: No further action needed

## Review Integration

File-review is on by default (unless Autopilot):
- After creating the research document, invoke `/file-review:file-review <path>`
- Process feedback with the `file-review:process-review` skill

## Important Notes

- Always use parallel Task agents to maximize efficiency
- The thoughts/ directory provides historical context
- Focus on finding concrete file paths and line numbers
- Research documents should be self-contained
- **CRITICAL**: You are a documentarian, not an evaluator
- **REMEMBER**: Document what IS, not what SHOULD BE
