---
date: 2026-03-17T00:00:00-04:00
author: Taras
topic: "/learning skill for cc-plugin/base — compounding knowledge across projects and teams"
tags: [brainstorm, cc-plugin, learning, knowledge-management, cross-project]
status: completed
exploration_type: idea-to-develop
last_updated: 2026-03-19
last_updated_by: Claude
---

# /learning Skill for cc-plugin/base — Brainstorm

## Context

Taras is considering adding a `/learning` skill to the cc-plugin/base plugin. The core idea is a **compounding learning mechanism** that works cross-project and across team members (agents).

**Initial framing from Taras:**

1. **Setup a knowledge base connector** — support multiple backends: qmd, obsidian cli, @desplega.ai/agent-fs (npm), local files in `thoughts/.../learnings`
2. **Update global CLAUDE.md** — so the agent knows about the knowledge base and how to use it
3. **Compound learning** — as other skills/commands do work, the `/learning` skill captures findings and makes them available for future sessions

The goal is to build institutional memory that persists across projects, sessions, and team members. Not just "what did we do" but "what did we learn" — patterns, gotchas, decisions, and reusable insights.

**Existing related mechanisms:**
- Claude Code's built-in auto-memory system (`~/.claude/projects/.../memory/`)
- CLAUDE.md files (global and project-level)
- `thoughts/` directories for research and plans
- `brain` CLI for personal knowledge management
- `qmd` MCP server for searching markdown collections
- `agent-swarm` inject-learning tool

## Exploration

### Q: What's the unit of a learning?
Both tiered — quick atomic captures for small things (gotchas, patterns), and more structured entries for significant findings. Format is primarily markdown files, though JSON is acceptable too. The system should be flexible on format.

**Insights:** This suggests the skill shouldn't impose a rigid schema. Markdown-first with optional frontmatter for metadata (tags, date, project, author) is likely the right call. The retrieval layer (qmd, search) handles discoverability rather than strict structure.

### Q: Who writes the learnings — agent, human, or both? Should other skills auto-emit?
Both. The working agreement should define what gets captured automatically. Think of it as a **retrospective of core learnings during development**: product decisions, common mistakes, human nudges/corrections, communication patterns. Other skills should participate — this is a cross-cutting concern, not isolated.

**Insights:** This is more ambitious than a simple note-taking skill. It's closer to an **organizational learning system** — the agent acts as a reflective practitioner. Key categories emerge:
- **Product decisions** — "we chose X because Y" (from brainstorms/plans)
- **Common mistakes** — "tried X, it broke because Y" (from debugging/implementation)
- **Human nudges** — when Taras corrects the agent's approach (overlaps with feedback memories)
- **Communication patterns** — how to frame things, what level of detail works

This has overlap with Claude's built-in auto-memory. The distinction needs to be clear: auto-memory is per-user/per-project ephemeral preferences, while `/learning` is **durable institutional knowledge** meant to compound across the team.

### Q: Backend model — one, many, or layered?
User picks one primary backend for writing. But if there are learnings in `thoughts/` (git-tracked), those should always be considered too — this enables cross-collaboration. So it's effectively **write to one, but always read local `thoughts/` too**.

**Insights:** This creates a clean two-layer model:
1. **Local layer** — `thoughts/.../learnings/` in the repo, git-tracked, visible to all collaborators (human and agent)
2. **Personal/remote layer** — user's chosen backend (qmd collection, obsidian vault, agent-fs, etc.) for cross-project knowledge

The local layer is the collaboration surface. The remote layer is the personal/team knowledge graph. When recalling, query both. When writing, write to the configured primary backend (which might _be_ local for simple setups).

### Q: How does /learning relate to existing knowledge systems?
Complement all existing tools (auto-memory, CLAUDE.md, brain, inject-learning) AND add a bridge layer so learnings can be promoted between systems. Auto-memory stays for session preferences, brain for personal notes, CLAUDE.md for project instructions. Learnings are a new layer for **durable team knowledge** with the ability to promote insights between systems (e.g., a learning could be promoted to a CLAUDE.md rule, or to a brain note).

**Insights:** The bridge/promotion concept is key. It means:
- A learning starts as a captured insight
- If it proves broadly useful, it can be **promoted** to CLAUDE.md (project or global)
- If it's personal, it can be sent to brain
- If it's team-wide, it can be shared via agent-swarm inject-learning
- The `/learning` skill becomes the **triage point** for knowledge, not the only store

### Q: When should learnings surface?
Task-start injection + on-demand, plus a hook that nudges when desplega skills are invoked. Check for relevant prior learnings at the start of research, planning, implementation, etc.

**Insights:** Three recall triggers:
1. **Task-start** — when other desplega skills begin, query learnings for the topic
2. **On-demand** — explicit `/learning recall <topic>`
3. **Skill hook** — PreToolUse/similar hook fires when desplega skills activate, injecting a reminder to check learnings

### Q: How do learnings travel cross-project?
On demand — the agent or user explicitly queries the knowledge base when working in a different project. Not automatic sync.

**Insights:** This is pragmatic. The backend choice matters here:
- **qmd** — if both projects are indexed as collections, cross-project query is natural (query with collection param or across all)
- **agent-fs** — centralized store, so cross-project is inherent
- **local thoughts/** — git-bound, so cross-project requires the user to reference another repo's learnings
- **brain** — already cross-project by design (global CLI)

The on-demand approach avoids the complexity of sync infrastructure. The skill just needs to know how to query the configured backend for learnings relevant to the current context. If the backend is project-scoped (local files), cross-project is limited; if it's global (qmd, brain, agent-fs), it just works.

### Q: What triggers learning capture?
Baked into each skill's SKILL.md — each desplega skill (research, plan, implement, verify, etc.) gets a "capture learnings" step added to its workflow.

**Insights:** This is the cleanest approach because:
- Each skill knows its own context best — a research skill knows what was surprising in the findings, an implement skill knows what broke and why
- It's deterministic — not dependent on hooks firing correctly
- It's auditable — you can see the capture step in each SKILL.md
- It means modifying all 9 existing skills to add a capture step (or a shared sub-skill reference)

The sub-skill pattern could work here: `**OPTIONAL SUB-SKILL:** Consider using desplega:learning to capture key findings` — letting each skill invoke `/learning capture` with structured context about what was learned. This keeps the learning logic centralized while the trigger is distributed.

### Q: Setup UX — how does first run work?
Convention first: default to `thoughts/<user>/learnings/` immediately so it works out of the box. Then ask if you want to configure additional backends. Config stored in `~/.agentic-learnings.json` (purely config, not learnings themselves).

**Insights:** Good separation — `~/.agentic-learnings.json` is config (which backends, paths, preferences), while actual learnings live in the configured backends. This file is:
- User-global (not per-project)
- Machine-portable (copy it to a new machine, point to your backends)
- The skill reads this on every invocation to know where to write/read

### Q: Config shape for ~/.agentic-learnings.json?
Iterated on a sketch. Key adjustments from Taras:
- qmd can have **multiple collections** (not just one)
- agent-fs uses `<org_id>/<drive_id>/<optional_path>` addressing
- **Remove brain references** — brain is separate, not a backend for learnings

Revised config sketch:
```json
{
  "version": 1,
  "defaultBackend": "local",
  "backends": {
    "local": {
      "type": "local",
      "path": "thoughts/{user}/learnings"
    },
    "qmd": {
      "type": "qmd",
      "collections": ["learnings", "team-learnings"]
    },
    "agent-fs": {
      "type": "agent-fs",
      "org": "<org_id>",
      "drive": "<drive_id>",
      "path": "learnings"
    }
  },
  "capture": {
    "categories": [
      "product-decisions",
      "technical-gotchas",
      "human-nudges",
      "patterns",
      "mistakes"
    ],
    "autoPrompt": true
  },
  "promotion": {
    "claudeMd": true
  }
}
```

**Insights:** Brain is explicitly out of scope as a backend — it's a separate tool with its own purpose. The config is clean: local for simple/tracked, qmd for searchable collections (multiple!), agent-fs for team/org-level shared knowledge.

### Q: What failure modes worry you most?
All three equally: noise/quality, ceremony/friction, and recall/surfacing.

**Insights:** These three risks need mitigation strategies baked into the design:

1. **Noise/quality** — Mitigate with:
   - Categories that force classification (is this a decision? a gotcha? a pattern?)
   - A "significance threshold" — the skill should ask itself "would this help someone else in a future session?" before capturing
   - Periodic review/pruning (could be a `/learning prune` or `/learning review` subcommand)

2. **Ceremony/friction** — Mitigate with:
   - The sub-skill pattern — other skills invoke learning capture as a natural step, not an extra task
   - Quick capture format: one line + category is enough for atomic insights
   - No mandatory fields beyond the learning itself and a category

3. **Recall/surfacing** — Mitigate with:
   - The PreToolUse hook nudge when desplega skills fire
   - Semantic search via qmd (not just keyword matching)
   - Task-start injection that's context-aware (query with the topic/problem at hand)

### Q: What's the MVP scope?
Full capture/recall/promote cycle with backend support from v1. Let's design how each backend works.

### Q: How do backends relate to each other?
**Key insight from Taras:** Backends aren't alternatives — they're **progressive tiers of reach**:

| Tier | Backend | Write | Search | Scope |
|------|---------|-------|--------|-------|
| 1 | **local** | `thoughts/{user}/learnings/` in cwd | grep/glob the directory | Single repo |
| 2 | **qmd** | Same local files, but qmd indexes them | qmd semantic search across collections | Cross-repo (each repo's thoughts/shared/learnings is a collection) |
| 3 | **agent-fs** | Shared drive via agent-fs API | Remote search via agent-fs | Cross-repo + remote (team-wide, org-wide) |

Each tier adds a layer:
- **local** → works out of the box, git-tracked, no dependencies
- **qmd** → adds semantic search + cross-repo (if you add qmd collections pointing to each repo's learnings dir)
- **agent-fs** → adds remote storage + team sharing (learnings live in a shared org drive)

They can be **stacked**: you can have local + qmd, or local + agent-fs, or all three. Writes go to the defaultBackend, reads query all configured backends.

**Insights:** This tiered model is elegant because:
- Getting started is zero-friction (just local files)
- Cross-repo comes from qmd config, not from the skill itself
- Team sharing comes from agent-fs, which is already designed for org-level storage
- The skill doesn't need to implement sync — each backend tier handles its own reach

### Q: How does the skill interact with agent-fs?
Via CLI commands — shell out to `npx @desplega.ai/agent-fs` or a global install. This keeps the skill as a pure SKILL.md (markdown instructions + bash commands) without needing a runtime or imports.

**Insights:** This is consistent with how other skills work — they're markdown instructions that guide the agent to use tools (Bash, Read, Write, MCP). The backend interaction becomes:
- **local**: Write tool to create .md files, Grep/Glob for search
- **qmd**: qmd MCP tools (query, get) for search
- **agent-fs**: Bash tool to run CLI commands for read/write

### Q: How does CLAUDE.md integration work?
Static awareness section added during `/learning` setup, plus individual learnings can be **promoted** as CLAUDE.md rules via `/learning promote`. The CLAUDE.md section should mention the `/learning` skill so future sessions know how to use the system effectively.

**Insights:** The CLAUDE.md section acts as a "bootstrap pointer" — it tells the agent: "a learning system exists, here's how to use it." Individual promotions then add specific rules. Example flow:
1. Setup adds to CLAUDE.md: "Use `/learning recall <topic>` before starting research/planning. Check `~/.agentic-learnings.json` for config."
2. Later, a learning like "always check for stale qmd indexes before searching" gets promoted → becomes a CLAUDE.md rule

### Q: What are the skill subcommands?
Confirmed command surface:
- `/learning` — setup wizard + status overview
- `/learning capture <insight>` — write a learning to the configured backend
- `/learning recall <topic>` — search across backends for relevant learnings
- `/learning promote <id>` — promote a learning to CLAUDE.md (project or global)
- `/learning review` — review existing learnings, prune low-value ones

### Q: When should learnings surface — task-start, on-demand, or ambient?
Task-start injection + on-demand. Additionally, a hook that intercepts when desplega skills are invoked to nudge the agent to check/use learnings or ask the user. Similar pattern to existing validation hooks.

**Insights:** Three recall triggers:
1. **Task-start** — when `/research`, `/plan`, `/implement-plan` etc. begin, query learnings for the topic
2. **On-demand** — explicit `/learning recall <topic>` for ad-hoc queries
3. **Skill hook** — a PreToolUse or similar hook that fires when desplega skills are invoked, nudging the agent to consult learnings

The hook approach is elegant because it's non-intrusive — it's a nudge in `additionalContext`, not a hard requirement. The agent can choose to query or not based on relevance. Need to look at the existing validation hook pattern in the plugin to model this.

## Synthesis

### Key Decisions

1. **Tiered backend model** — local → qmd → agent-fs, each adding reach (single repo → cross-repo → remote/team). Not alternatives, but progressive layers that can be stacked.
2. **Config in `~/.agentic-learnings.json`** — purely config (backends, preferences), not learnings. User-global, machine-portable.
3. **Capture baked into existing skills** — each desplega skill (research, plan, implement, etc.) gets a "capture learnings" sub-skill step. Not a hook, not session-end — embedded in the workflow.
4. **Recall: task-start + on-demand + hook nudge** — automatic query when desplega skills start, explicit `/learning recall`, and a PreToolUse hook that nudges when skills fire.
5. **Complement existing systems + bridge** — auto-memory stays for preferences, brain stays for personal notes. Learnings are durable institutional knowledge with promotion to CLAUDE.md.
6. **Brain is out of scope** — not a backend for learnings. Separate tool, separate purpose.
7. **Cross-project is on-demand** — no automatic sync. Backend choice determines reach (qmd gives cross-repo, agent-fs gives remote).
8. **Flexible format** — primarily markdown with optional frontmatter, but JSON acceptable. No rigid schema.
9. **CLAUDE.md gets static section + individual promotions** — setup adds awareness, `/learning promote` adds specific rules.

### Open Questions

- **Learning file naming convention** — timestamp-based? slug-based? How to generate stable IDs for `/learning promote <id>`?
- **qmd indexing** — does qmd auto-index new files in a collection, or does it need a re-index step after writing?
- **agent-fs CLI maturity** — is the CLI stable enough to depend on? What commands does it expose for read/write/search?
- **Skill modification scope** — modifying all 9 existing SKILL.md files is non-trivial. Should this be a "RECOMMENDED SUB-SKILL" or "REQUIRED SUB-SKILL" in each?
- **Significance threshold** — how does the agent decide what's worth capturing? Rules-based, or learned over time from human feedback (accepted/rejected captures)?
- **Pruning mechanics** — `/learning review` needs a UX. Batch review? One-at-a-time? Integrate with file-review?
- **Multi-user scenarios** — when two agents capture learnings in the same repo, how to avoid conflicts? (Separate user dirs help but shared learnings need coordination)

### Constraints Identified

1. **Skills are pure markdown** — no runtime, no imports. Backend interaction must be via tools the agent already has (Write, Grep, Bash, MCP).
2. **Plugin hooks are limited** — PreToolUse can inject context but can't force behavior. The nudge is advisory.
3. **qmd collections are pre-configured** — the skill can't create new qmd collections, only query existing ones.
4. **agent-fs requires auth** — org_id/drive_id imply authentication setup before agent-fs backend works.
5. **CLAUDE.md has a ~200 line soft limit** — promoted learnings need to be concise or they'll bloat the file.

### Core Requirements

1. **`/learning` command** — setup wizard (convention-first, ask to configure), status display showing configured backends and learning count.
2. **`/learning capture`** — write a learning to the default backend. Accepts category, content, and optional context (project, related files). Minimal friction for atomic insights.
3. **`/learning recall`** — search across all configured backends. Returns relevant learnings ranked by relevance. Works with natural language topics.
4. **`/learning promote`** — take a learning and add it as a rule to CLAUDE.md (project or global). Formats it appropriately.
5. **`/learning review`** — review existing learnings for quality, relevance, and pruning opportunities.
6. **Backend adapter pattern** — each backend (local, qmd, agent-fs) has a consistent interface: write(learning), search(query), list(), delete(id).
7. **Sub-skill integration** — other desplega skills reference `/learning capture` as part of their workflow.
8. **Config file `~/.agentic-learnings.json`** — stores backend config, capture preferences, promotion settings.
9. **CLAUDE.md bootstrap** — setup adds a section to CLAUDE.md explaining the learning system and how to use it.
10. **Hook for skill nudge** — a mechanism (PreToolUse hook or SKILL.md instruction) that reminds the agent to check learnings when starting desplega workflows.

## Next Steps

- [Handoff decision: research, plan, or parked]
