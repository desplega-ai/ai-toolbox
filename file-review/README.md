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

```bash
bun run release 1.0.0
```

This will tag and push `file-review-v1.0.0`, triggering the GitHub Actions workflow to build binaries for both Apple Silicon and Intel Macs.

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
