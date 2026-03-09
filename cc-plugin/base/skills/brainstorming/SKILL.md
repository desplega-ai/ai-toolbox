---
name: brainstorming
description: Interactive exploration of ideas through Socratic Q&A. Produces progressive documents that serve as lightweight pre-PRDs feeding into research.
---

# Brainstorming

You are facilitating interactive exploration of ideas through Socratic Q&A. The goal is understanding before implementation — documents grow progressively during the session and end as lightweight pre-PRDs that feed into `/research` or `/create-plan`.

## Working Agreement

These instructions establish a working agreement between you and the user. The key principles are:

1. **AskUserQuestion is your primary communication tool** - Whenever you need to ask the user anything, use the **AskUserQuestion tool**. Don't output questions as plain text - always use the structured tool so the user can respond efficiently.

2. **Establish preferences upfront** - Ask about user preferences at the start of the workflow, not at the end when they may want to move on.

3. **Autonomy mode guides interaction level** - The user's chosen autonomy level determines how often you check in, but AskUserQuestion remains the mechanism for all questions.

### User Preferences

Before starting brainstorming, establish these preferences:

**File Review Preference** - Check if the `file-review` plugin is available (look for `file-review:file-review` in available commands).

If file-review plugin is installed, use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "Would you like to use file-review for inline feedback on the brainstorm document after synthesis?" | 1. Yes, open file-review when synthesis is ready (Recommended), 2. No, just show me the document |

Store this preference and act on it after synthesis (see "Review Integration" section).

## When to Use

This skill activates when:
- User invokes `/brainstorm` command
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:brainstorming`
- User wants to explore an idea before committing to research or planning
- User isn't ready for formal research yet

## Autonomy Mode

Brainstorming is inherently interactive, so only two modes are supported:

| Mode | Behavior |
|------|----------|
| **Verbose** (Default) | Full Socratic exploration, ask one question at a time, rich discussion |
| **Critical** | Fewer questions, focus on the most impactful areas, reach synthesis faster |

**Autopilot is not supported** — brainstorming requires human input by design. If Autopilot is requested, fall back to Critical with a note explaining why.

The autonomy mode is passed by the invoking command. If not specified, default to **Verbose**.

## Process Steps

### Step 1: Initialize Document

Create `thoughts/<username|shared>/brainstorms/YYYY-MM-DD-<topic>.md` using the template at `cc-plugin/base/skills/brainstorming/template.md`.

**Path selection:** Use the user's name (e.g., `thoughts/taras/brainstorms/`) if known from context. Fall back to `thoughts/shared/brainstorms/` when unclear.

Fill in the frontmatter and the Context section with whatever is known: the topic, any context provided, initial thoughts. Write what we know so far.

### Step 2: Assess Phase

Understand the shape of the exploration. Use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "What kind of exploration is this?" | 1. Problem to solve, 2. Idea to develop, 3. Comparison to make, 4. Workflow to improve, 5. Other (describe) |

Update the document's `exploration_type` frontmatter and Context section with the exploration framing.

### Step 3: Explore Phase

Socratic Q&A loop. The goal is to systematically uncover requirements, constraints, and insights.

**Rules:**
- Ask **ONE question at a time** via AskUserQuestion
- After each answer, append a new section to the document under `## Exploration`:
  ```markdown
  ### Q: [Your question]
  [User's answer]

  **Insights:** [Any observations, implications, or connections you noticed]
  ```
- Identify the next most important question to narrow scope or deepen understanding
- Continue until the user signals they're satisfied or natural saturation is reached

**Question strategy:**
- Start broad: understand the problem space and goals
- Narrow progressively: constraints, existing solutions, non-functional requirements
- Probe edges: "What would make this fail?", "What's the simplest version?", "What are you NOT trying to solve?"

### YAGNI Principle

**CRITICAL**: Resist premature solutions during the Explore phase. The goal is understanding, not implementation. If the user starts solutioning too early:
- Acknowledge the idea briefly
- Redirect to requirements: "That's an interesting approach. Before we commit to it, let's make sure we understand [relevant constraint/requirement]. [Follow-up question]"
- Solutions belong in the Synthesis or in a subsequent `/create-plan`

### Step 4: Synthesize Phase

When exploration is complete (user signals done, or natural saturation), append a `## Synthesis` section:

```markdown
## Synthesis

### Key Decisions
- [Decision 1]
- [Decision 2]

### Open Questions
- [Question that still needs investigation]

### Constraints Identified
- [Constraint 1]
- [Constraint 2]

### Core Requirements
- [Requirement 1 — lightweight PRD-style]
- [Requirement 2]
```

### Step 5: Handoff Phase

Before handoff, offer to run `/review` on the brainstorm document to identify unexplored areas.

Then use **AskUserQuestion** with:

| Question | Options |
|----------|---------|
| "What's the next step?" | 1. Start research based on this brainstorm (→ `/research`), 2. Create a plan directly (→ `/create-plan`), 3. Done for now (park the brainstorm) |

Based on the answer:
- **Research**: Suggest the `/research` command with the brainstorm file as input context
- **Plan**: Suggest the `/create-plan` command with the brainstorm file as input context
- **Done**: Set the document's `status` to `parked` or `complete` as appropriate

## Document Evolution

The brainstorm document is a living artifact during the session. It starts rough and gains structure through the Q&A process. By the end, it should be readable as a standalone context document that someone else could pick up and understand.

## Review Integration

If the `file-review` plugin is available and the user selected "Yes" during User Preferences setup:
- After synthesis, invoke `/file-review:file-review <path>` for inline human comments
- Process feedback with `file-review:process-review` skill
- If user selected "No", skip this step
