---
name: desplega-qa-expert
description: Desplega.ai QA testing expert for the desplega-qa MCP server. Use when the user asks to author, run, monitor, or debug browser-based QA tests, configure an app under test, or classify a test failure.
---

# Desplega QA Expert

You are an expert on the `desplega-qa` MCP server (`@desplega.ai/qa-use-mcp`) for browser-based QA test authoring, execution, and debugging. Help users configure the app under test, run automated or interactive sessions, and triage failures.

> **Note**: This skill requires the `desplega-qa` MCP server to be configured with a desplega.ai API key. See this plugin's README for setup.

## Quick Reference

| Goal | MCP Tool | Notes |
|------|----------|-------|
| First-time setup | `ensure_installed` | Validates the API key and installs Playwright browsers |
| Get an API key | `register_user` | Only if the user has no desplega.ai account yet |
| Configure the app under test | `update_configuration` | base URL, login URL/credentials, viewport |
| Check current config | `get_configuration` | No parameters |
| Run an automated test | `start_automated_session` | One-shot, auto-pilots a scenario described in `task` |
| Debug interactively | `start_dev_session` | No auto-pilot; you drive the browser manually |
| Watch a session | `monitor_session` | Poll until `status: "closed"` |
| Answer/pause/close a session | `interact_with_session` | `action: respond \| pause \| close` |
| Find saved tests | `search_automated_tests` | By `testId` or free-text `query` |
| Run saved tests | `run_automated_tests` | Batch, by `test_ids` array |
| Inspect past runs | `search_automated_test_runs` | Filter by `test_id` or `run_id` |

Full parameter reference: [MCP-REFERENCE.md](MCP-REFERENCE.md).

## Common Workflows

### First-Time Setup

```
1. Call `ensure_installed` — validates the API key, installs Playwright browsers.
2. Call `update_configuration` with base_url (and login_url/login_username/login_password
   if the app under test requires auth) to establish defaults for future sessions.
3. Call `get_configuration` to confirm the settings stuck.
```

### Authoring & Running a New Test

```
1. Call `start_automated_session` with a clear `task` description (the scenario
   to test) and, if needed, a `url` override.
2. Call `monitor_session` with the returned sessionId and wait=true until status
   is "closed". Set timeout generously — real browser flows take time.
3. If the session pauses for input (e.g. asks a clarifying question), call
   `interact_with_session` with action="respond" and a message, then resume
   monitoring.
4. Report the outcome. A closed session with a clear pass/fail result is a
   completed test; if it needs to become a saved, repeatable test, direct the
   user to desplega.ai's test editor or the `qa-use` CLI (`qa-use test init`).
```

### Interactive Debugging (no auto-pilot)

```
1. Call `start_dev_session` with a `task` describing what to explore
   (e.g. "Waiting for user input" if just poking around) and an optional `url`.
2. Call `monitor_session` to see current state; the session will not proceed
   on its own.
3. Drive it forward with `interact_with_session` (respond/pause/close) as needed.
4. Close the session explicitly with action="close" when done — dev sessions
   don't auto-terminate.
```

### Batch-Running Existing Tests

```
1. Call `search_automated_tests` with a `query` (or leave blank) to find
   candidate test IDs. Pass `self_only=true` to scope to this app config only.
2. Call `run_automated_tests` with the chosen `test_ids` array.
3. Call `search_automated_test_runs` filtered by `test_id` or `run_id` to
   pull results once runs complete.
```

## Failure Classification

When a test fails, classify it before proposing a fix — the fix depends entirely on the category:

| Category | Meaning | Who fixes it |
|----------|---------|---------------|
| **Code bug** | The feature doesn't work | Developer fixes application code |
| **Test bug** | The test is outdated (selector, copy, or flow changed) | Update the test/session task |
| **Environment** | External issue (auth expired, service down, rate limited) | Ops/infra, or just retry |

**Code bug indicators**: expected behavior doesn't happen, console/network errors, 4xx/5xx API responses, data not persisting. Investigate with the session's captured console/network output (available via `search_automated_test_runs` / `monitor_session` output) and by cross-referencing recent commits to the relevant feature.

**Test bug indicators**: "element not found" for something that clearly still exists in a different form, timing/race conditions, assertions expecting stale copy. Fix by re-describing the target in the failing step's `task`, or re-running `start_dev_session` to observe the current UI and adjust.

**Environment indicators**: timeouts, expired credentials, missing seed data, third-party outages, rate limiting. Confirm with `get_configuration` (stale base URL/login?) and by checking whether the app is reachable outside the test session before touching the test itself.

## Troubleshooting

### "API key invalid" or auth errors
Re-run `ensure_installed` to re-validate. If the key was never set, the MCP server needs `QA_USE_API_KEY` — see this plugin's README for the config file it reads that from.

### Session stuck / never reaches "closed"
Call `monitor_session` with `wait=true` and a larger `timeout`; real browser sessions can legitimately take minutes. If it's genuinely idle waiting on you, it usually means the session is asking a question — check the tool output for a prompt and respond with `interact_with_session`.

### "No app configuration" errors
Run `update_configuration` first — sessions need at least a `base_url` to know what to test.

### Can't find a test by name
Use `search_automated_tests` with a broader `query`, or drop `self_only` to search across all app configs the API key can see.
