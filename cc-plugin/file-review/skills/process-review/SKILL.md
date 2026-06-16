---
name: process-review
description: Process review comments in a file after user finishes reviewing in file-review GUI. Extracts HTML comment markers, guides Claude through addressing each comment interactively, and removes resolved markers.
---

# Process Review Comments

Thin redirect. Follow the **Process Comments** section of the `file-review:file-review` skill for full instructions.
(The section is now batch-aware, collects markers across files first, provides richer +/- context in AskUserQuestions, requires unified diff + explicit OK before Apply edits, and produces per-file final summary stats. No change to this shim.)
