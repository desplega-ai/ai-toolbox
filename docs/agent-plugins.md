# Agent Plugins adoption map

[Agent Plugins](https://agent-plugins.org) is an additive, portable distribution format for clients such as VS Code, Cursor, and GitHub Copilot. It does not replace ai-toolbox's Claude Code marketplace: Claude Code is not currently listed as a compatible Agent Plugins client, and its commands, hooks, and agents remain under the existing plugin layout.

## Pilot

The `agent-swarm` and `wts` directories are dual-format packages. Their existing Claude Code manifests remain authoritative and receive matching feature-version bumps, while root `plugin.json` files expose the same packages to Agent Plugins clients. Claude-only `commands/` stay in place, and their skills were already discoverable at the required immediate `skills/<skill-name>/SKILL.md` depth.

`agent-swarm/mcp.json` uses a bundled stdio launcher because Agent Plugins 1.0 permits only literal headers for a remote MCP server. Agent Swarm requires a per-install bearer token and agent ID, so committing a direct `streamable-http` entry would either leak credentials or fail at runtime. The manifest passes a `${PLUGIN_DATA}/agent-swarm.json` configuration path to the launcher, which reads `apiKey`, `agentId`, and an optional `mcpUrl`, then bridges to the HTTP endpoint with pinned `mcp-remote@0.1.38`. This keeps credentials out of the package and avoids depending on ambient environment variables that portable clients may sanitize.

Users still need to create that protected per-plugin data file using the location exposed by their client. Native OAuth support in Agent Swarm would let us replace this setup step and bridge with a direct remote entry later.

## Remaining ai-toolbox plugins

| Plugin | Recommendation | Why | Estimate |
| --- | --- | --- | --- |
| `desplega` (`base`) | Convert next | Its many immediate-child skills are the strongest portable asset. Keep commands, hooks, and agents as Claude-only capabilities and describe the reduced portable surface clearly. | 0.5-1 day |
| `file-review` | Convert | Three existing skills are portable; document that the local GUI/CLI is still a prerequisite. | 2-4 hours |
| `brain` | Convert | The expert skill is portable and useful across clients; translate command-only entry points only where a skill provides equivalent behavior. | 2-4 hours |
| `remarkable` | Convert | The skill and scripts fit the portable conventions; validate platform dependencies and credentials. | 2-4 hours |
| `oapi` | Convert next | It is skills-heavy, client-neutral, and only needs a root manifest plus CLI prerequisite documentation. | 1-2 hours |
| `radical-candor` | Convert | The feedback skill and TypeScript reference-search script are portable once runtime requirements are documented. | 2-4 hours |
| `teams` | Do not convert yet | It currently relies on Claude session hooks, tmux, and a local Python MCP server, with no portable skill. First separate the generic messaging server from Claude lifecycle/session behavior. | 1-2 days after that split |

Converting the six recommended packages together, including schema checks and smoke tests, should take about 2-3 engineering days.

## Agent Swarm

Do both sides, in sequence: first publish an `agent-swarm` plugin containing its MCP connection plus a curated coordination/core-operations subset of the 52 template skills; then teach Agent Swarm to consume third-party Agent Plugins when it assembles skills for supported harnesses. Start with the publisher because it proves packaging, auth, versioning, and installation on real clients. Add consumer support as a second phase with strict manifest/schema validation, immediate-child skill discovery, and explicit handling of ignored vendor extension directories. Estimate 2-3 days for a curated publisher after auth is settled and 4-6 days for a safe client implementation with tests.

Picateclas is concurrently doing the MCP Registry `server.json` work in `desplega-ai/agent-swarm`; that is a different public-registry surface. `server.json` describes an MCP server to the MCP Registry; `plugin.json` packages skills and optional MCP configuration for Agent Plugins clients. They can share names, descriptions, repository URLs, and release automation, but neither manifest replaces the other.

## Desplega

Desplega should publish a focused plugin that pairs its MCP server with a small set of test-authoring, debugging, and result-interpretation skills. That creates a useful installable product surface inside compatible coding agents rather than a manifest-only marketing badge: users can author tests with Desplega's conventions and immediately execute or inspect them through MCP. Keep account/project authentication outside the package, document the portable subset separately from Claude-only automation, and pilot it after the Agent Swarm auth pattern is settled. Estimate 2-3 days for packaging and skills curation, plus 1-2 days if the MCP authentication flow needs client-facing work.
