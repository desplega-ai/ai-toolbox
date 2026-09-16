# desplega-qa MCP Tool Reference

Full parameter reference for the `desplega-qa` MCP server (`@desplega.ai/qa-use-mcp`). See [SKILL.md](SKILL.md) for workflows that chain these together.

## Setup & Configuration

### `ensure_installed`
Ensure the API key is set, validate authentication, and install Playwright browsers.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `apiKey` | string | no | Overrides the configured API key (falls back to `QA_USE_API_KEY`) |

### `register_user`
Register a new desplega.ai account and receive an API key.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `email` | string | yes | Email address for registration |

### `update_configuration`
Update the application-under-test configuration: base URL, login credentials, viewport.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `base_url` | string | no | Base URL for the application being tested |
| `login_url` | string | no | Login page URL |
| `login_username` | string | no | Default username for login testing |
| `login_password` | string | no | Default password for login testing |
| `vp_type` | string | no | `big_desktop` \| `desktop` \| `mobile` \| `tablet` (default: `desktop`) |

### `get_configuration`
Get the current application configuration. No parameters.

## Session Management

### `search_sessions`
Search/list sessions (automated tests and dev sessions), paginated.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | number | no | Max results (default: 10, min: 1) |
| `offset` | number | no | Results to skip (default: 0, min: 0) |
| `query` | string | no | Filter by task, URL, or status |

### `start_automated_session`
Start an auto-piloted E2E test session. Returns a `sessionId` for `monitor_session`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task` | string | yes | The testing scenario to execute |
| `url` | string | no | Overrides the app config's `base_url` |
| `dependencyId` | string | no | A prior self-test ID this session depends on |
| `headless` | boolean | no | Default: `false` (visible, for observability) |

### `start_dev_session`
Start an interactive, non-auto-piloted session for manual exploration/debugging.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task` | string | yes | What to explore or debug (a placeholder is fine) |
| `url` | string | no | Overrides the app config's `base_url` |
| `headless` | boolean | no | Default: `false` |

### `monitor_session`
Poll a session's status. Keep calling until `status: "closed"`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | yes | Session to monitor |
| `wait` | boolean | no | Wait for a non-running state (max 25s per call, MCP-timeout-safe) |
| `timeout` | number | no | User-facing wait timeout in seconds (default: 60) |

### `interact_with_session`
Respond to, pause, or close a session.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | yes | Session to interact with |
| `action` | string | yes | `respond` \| `pause` \| `close` |
| `message` | string | conditional | Required for `respond`; optional otherwise |

## Test Management

### `search_automated_tests`
Search saved tests by ID or free text.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `testId` | string | no | Exact test ID — if given, other params are ignored |
| `query` | string | no | Filter by name, description, URL, or task |
| `limit` | number | no | Default: 10, min: 1 |
| `offset` | number | no | Default: 0, min: 0 |
| `self_only` | boolean | no | Default: `false` — restrict to this app config's own tests |

### `run_automated_tests`
Execute multiple saved tests simultaneously.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_ids` | string[] | yes | Test IDs to execute |
| `app_config_id` | string | no | Overrides the API key's default app config |
| `ws_url` | string | no | Overrides the default global tunnel WebSocket URL |

### `search_automated_test_runs`
Search past test runs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_id` | string | no | Filter by test ID |
| `run_id` | string | no | Filter by run ID |
| `limit` | number | no | Default: 10, min: 1 |
| `offset` | number | no | Default: 0, min: 0 |

## Environment Variables (server-side, set by this plugin's launcher)

| Variable | Required | Description |
|---|---|---|
| `QA_USE_API_KEY` | yes | desplega.ai API key |
| `QA_USE_API_URL` | no | Default: `https://api.desplega.ai` |
| `QA_USE_APP_URL` | no | Default: `https://app.desplega.ai` |
| `QA_USE_REGION` | no | `us` \| `auto` (default: `auto`) |

Source: `@desplega.ai/qa-use-mcp@1.6.0` README (`## MCP Tools` / `## Configuration`).
