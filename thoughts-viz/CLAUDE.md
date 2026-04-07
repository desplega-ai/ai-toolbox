# thoughts-viz

## Stack

Bun, React 19, react-force-graph-2d, Commander.js, Biome, Fuse.js

## Commands

```bash
# Dev (single repo)
bun run src/index.ts serve <path>          # index + serve with HMR
bun run src/index.ts index <path> --force  # reindex cache

# Production (multi repo)
bun run reindex    # reindex + export all repos
bun run release    # reindex + export + build dist/
bun run src/index.ts serve --production    # serve from public/data/

# Checks
bun run tsc        # typecheck (d3-force-3d error is pre-existing, ignore it)
bun run lint:fix   # biome autofix
bun run test
```

## Timeline

- **On by default** for index, export, serve, sync. Use `--no-timeline` to skip.
- `--timeline-limit <n>` caps commits processed.
- Pre-computed from git history at index time. Gated by `GraphData.metadata.timeline` flag.
- Snapshot-by-reference: each commit stores node IDs / edge keys referencing `timeline.allNodes` / `timeline.allEdges`.

## Production Repos

Configured in `scripts/reindex-prod.ts`: ai-toolbox, agent-swarm, agent-fs, qa-use.

## Server Modes

- `serve <path>` — dev, in-memory `/api/graph`
- `serve --production` — static JSON from `public/data/`, manifest at `/data/manifest.json`
