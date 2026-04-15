# radical-candor plugin

Claude Code plugin that teaches Claude to give **Radical Candor** feedback, based on Kim Scott's framework from [radicalcandor.com](https://www.radicalcandor.com).

## What's inside

- **`skills/feedback/`** — the `/radical-candor:feedback` skill. Activates when the user asks for feedback, a review of an idea, or pushback on their thinking.
- **`scripts/rc-search.ts`** — Bun script to search radicalcandor.com content by query/slug. Caches the sitemap locally for 24h.

## Install

```bash
/plugin marketplace add desplega-ai/ai-toolbox
/plugin install radical-candor@desplega-ai-toolbox
```

## Use

```
/radical-candor:feedback review my approach to this refactor
```

Or just ask: "give me radically candid feedback on this".

## Search articles on a topic

```bash
bun run cc-plugin/radical-candor/scripts/rc-search.ts "feedback sandwich" --kind blog
bun run cc-plugin/radical-candor/scripts/rc-search.ts "performance" --limit 5 --fetch
```

## Framework, in one breath

Care Personally **×** Challenge Directly. Praise in public with **CORE** (Context, Observation, Result, Expected next steps). Criticize in private with **HIP** (Humble, Helpful, Immediate, In-person, not about Personality). The failure modes are Ruinous Empathy (caring but not challenging), Obnoxious Aggression (challenging but not caring), and Manipulative Insincerity (neither).

## Evals

The test prompts and assertions live at `skills/feedback/evals/evals.json`. That file is the reproducible spec and is checked into git.

Run results (grading, timings, `benchmark.json`, `review.html`) are written to `../radical-candor-workspace/` as a sibling to this plugin, which is **gitignored** (see root `.gitignore`: `cc-plugin/*-workspace/`). Treat it like a `coverage/` directory — regenerate it by re-running evals rather than committing it.

To re-run the evals, follow the skill-creator flow:

```bash
# Replay the 3 prompts with/without the skill, grade, and open the viewer.
# Requires claude-plugins-official skill-creator installed.
```

Latest result (v0.2.0 vs v0.1.0): 95% pass rate vs 82%, avg response length 99 vs 388 words.
