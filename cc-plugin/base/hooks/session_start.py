#!/usr/bin/env python3
"""SessionStart hook: inject a short, factual frame about the desplega
context-offloading workflow.

Fires on new / cleared sessions only (the matcher in plugin.json filters to
`startup|clear`), so it costs at most a few lines once per fresh context — no
per-turn nagging. The text is phrased as descriptive project info rather than
imperative commands, so it reads as context instead of tripping Claude's
prompt-injection defenses (which would surface it to the user verbatim).
"""

from __future__ import annotations

import json
import sys

FRAME = (
    "The desplega workflow keeps the main thread's context small — context "
    "quality degrades noticeably past ~40% of the window:\n"
    "- Push research and codebase exploration to sub-agents (the `Explore` "
    "agent, or `/desplega:research`) so raw file/search output never lands in "
    "the main context.\n"
    "- Persist progress to `thoughts/` files and hand off to a fresh session "
    "between major stages (`/desplega:brainstorm` → `/desplega:research` → "
    "`/desplega:create-plan` → `/desplega:implement-plan`) instead of `/compact`."
)


def main() -> None:
    try:
        json.load(sys.stdin)  # consume the payload; we don't need any field
    except (json.JSONDecodeError, ValueError):
        pass

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": FRAME,
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
