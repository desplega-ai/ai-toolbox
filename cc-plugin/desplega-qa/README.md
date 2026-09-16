# Desplega QA Plugin

Browser-based QA test authoring, execution, and debugging using the desplega.ai MCP server (`@desplega.ai/qa-use-mcp`).

## Prerequisites

This plugin requires a [desplega.ai](https://desplega.ai) account and API key.

Portable Agent Plugins clients start the bundled MCP bridge automatically. Create `desplega-qa.json` in the client-provided plugin data directory (the location represented by `${PLUGIN_DATA}`):

```json
{
  "apiKey": "your-desplega-ai-api-key",
  "apiUrl": "https://api.desplega.ai",
  "appUrl": "https://app.desplega.ai",
  "region": "us"
}
```

Only `apiKey` is required. `apiUrl`, `appUrl`, and `region` are optional overrides — omit them to use desplega.ai's defaults (`region: "us"` routes tunnel and API traffic to North America). Restrict the file to your user account because it contains a secret, for example with `chmod 600 /the/path/printed/desplega-qa.json` on macOS or Linux. The bridge requires Node.js 20 or newer with npm and downloads the pinned `@desplega.ai/qa-use-mcp@1.6.0` package through `npx`.

If configuration is absent, the bridge exits immediately and reports which environment variable (`DESPLEGA_QA_CONFIG`) points at the missing file. Restart or re-enable the plugin after saving it.

## Skills

### desplega-qa-expert

Guidance for authoring, running, and debugging desplega.ai QA tests through the MCP tools:
- Configuring the application under test (base URL, login credentials, viewport)
- Starting automated test sessions and interactive debugging sessions
- Monitoring sessions and responding to in-session prompts
- Searching and batch-running existing automated tests, and inspecting their runs
- Classifying a failure as a code bug, a stale test, or an environment issue, and picking the right fix

## Installation

Add this plugin to your Claude Code configuration, or use one of the portable clients described in [`docs/agent-plugins.md`](../../docs/agent-plugins.md).

## Usage

Ask about desplega.ai QA testing and Claude will automatically use the desplega-qa-expert skill:

- "Write a test for the login flow"
- "Run the checkout test and tell me if it passed"
- "This test is failing — is it a code bug or a stale test?"
- "Start a dev session so I can explore the checkout page"
