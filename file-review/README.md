# File Review

A file review tool with CodeMirror editor and Vim bindings, built with Tauri.

## Installation

### Via Homebrew

```bash
brew tap desplega-ai/tap
brew install file-review
```

### Manual Installation

```bash
bun run install:app
```

## Development

```bash
bun install
bun run dev      # Start dev server
bun run tauri dev  # Run Tauri app in dev mode
```

## Building

```bash
bun run tauri build
```

## Releasing

To create a new release:

1. Bump the version in `package.json`
2. Run:
```bash
bun run release
```

This reads the version from `package.json`, validates it's newer than the last release, then tags and pushes to trigger the GitHub Actions workflow.

---

## Homebrew Formula Template

For `desplega-ai/homebrew-tap`, create `Formula/file-review.rb`:

```ruby
class FileReview < Formula
  desc "File review tool with CodeMirror editor and Vim bindings"
  homepage "https://github.com/desplega-ai/ai-toolbox"
  version "1.0.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/desplega-ai/ai-toolbox/releases/download/file-review-v#{version}/file-review-darwin-arm64"
      sha256 "SHA256_ARM64"
    end
    on_intel do
      url "https://github.com/desplega-ai/ai-toolbox/releases/download/file-review-v#{version}/file-review-darwin-x86_64"
      sha256 "SHA256_X86_64"
    end
  end

  def install
    binary_name = Hardware::CPU.arm? ? "file-review-darwin-arm64" : "file-review-darwin-x86_64"
    bin.install binary_name => "file-review"
  end

  test do
    system "#{bin}/file-review", "--help"
  end
end
```

After each release, update `version` and the `sha256` values from the `.sha256` files in the GitHub release.

## Discovering pending review batches (v1 — live markers)

When you run `file-review` with no files (empty state), or use the agent skill `/file-review:file-review` (no arg), recent thought files + any `.md` files under `thoughts/{taras,shared}/**` that *still contain live `<!-- review-start(...) -->` or line-start markers* (left over from prior GUI sessions) are proposed as "pending review batches".

Pick one (or more) and it re-opens via the normal multi-tab load/append flow for further work or Process Comments.

To manually list from shell (same logic as the skill):
```sh
grep -rl '<!--\s*review-(start|line-start)' thoughts/taras/ thoughts/shared/ --include="*.md" 2>/dev/null
```

See `cc-plugin/file-review/skills/file-review/SKILL.md` (the "If no path provided" block and the dedicated "Review batches (v1)" section) for the canonical agent behavior. The extraction regexes and marker format are unchanged.

(The discovery stays opportunistic, scoped and fast; no sidecar or Rust change in this v1 slice.)

This behavior + the Phase-3 Process Comments polishing (richer Ask context, safe per-marker apply via explicit unified diff preview before host edit, batch summary, collected-first processing) was developed, self-applied (no-arg discovery proposal of a marker file, GUI + bg contract, richer Process apply/ack, clean), doc'd, and QA-verified during the Phase 4 cross-check of the originating plan itself and its touched skill artifacts. Process-review leaves no markers when Acknowledge/Apply chosen. See the plan at `thoughts/taras/plans/2026-06-16-file-review-editing-and-review-batches.md:Phase4` for end-to-end recorded demo traces and the final Manual E2E commands.
