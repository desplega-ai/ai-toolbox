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
