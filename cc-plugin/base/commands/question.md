---
description: One-shot question answering using the research process
model: inherit
argument-hint: [question]
---

# Question

A lightweight command that invokes the `desplega:questioning` skill to answer a question directly.

## When Invoked

1. **No autonomy flags** — this is always a one-shot answer. Just answer the question.

2. **ALWAYS invoke the `desplega:questioning` skill:**
   - Pass the question (the full argument string)
   - Let the skill handle research, synthesis, and handoff

3. **If no question provided:**
   - Use AskUserQuestion: "What's your question?"

## Example Usage

```
/question how does the validate-thoughts hook work?
/question what sub-agents does the researching skill spawn?
/question why is the brainstorm skill defaulting to verbose mode?
```
