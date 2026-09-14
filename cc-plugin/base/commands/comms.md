---
description: Re-express the last reply or current topic so it lands (simpler, visual, joint, or precise STE rewrite)
model: inherit
argument-hint: "[simpler|visual|joint|precise] [text or topic]"
---

# Comms

A thin wrapper that invokes the `desplega:comms` skill.

## When Invoked

1. **Parse an optional mode from the arguments:** `simpler`, `visual`, `joint`, or `precise`. If present, pass it as the requested mode.

2. **ALWAYS invoke the `desplega:comms` skill:**
   - Pass the mode if one was given, plus any remaining argument text (the artifact text to rewrite, or the topic to show)
   - With no arguments, let the skill dispatch from the target: your previous message, the current topic, or the given text

3. **If there is nothing to re-express** (no previous message, no topic, no text), say so in one line.

## Example Usage

```
/comms
/comms simpler
/comms visual how does the plan-checkbox hook work?
/comms precise "Spin up the worker and it should probably reconnect if the socket drops"
```
