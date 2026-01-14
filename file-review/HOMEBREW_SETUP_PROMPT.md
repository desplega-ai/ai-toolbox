# Claude Code Prompt: Setup file-review Homebrew Formula

Use this prompt in the `desplega-ai/homebrew-tap` repository:

---

## Prompt

Set up a Homebrew formula for `file-review`, a Tauri-based file review tool.

**Source repository:** https://github.com/desplega-ai/ai-toolbox
**Release artifacts:** https://github.com/desplega-ai/ai-toolbox/releases (look for `file-review-v*` tags)

### Release artifact naming:
- `file-review-darwin-arm64` - Apple Silicon binary
- `file-review-darwin-arm64.sha256` - SHA256 checksum
- `file-review-darwin-x86_64` - Intel binary
- `file-review-darwin-x86_64.sha256` - SHA256 checksum

### Tasks:
1. Create `Formula/file-review.rb` with architecture-specific downloads
2. Fetch the latest release version and SHA256 checksums from GitHub
3. The formula should:
   - Download the correct binary based on CPU architecture (arm64 vs x86_64)
   - Install it as `file-review` in the bin directory
   - Include a basic test block

### Formula template structure:
```ruby
class FileReview < Formula
  desc "File review tool with CodeMirror editor and Vim bindings"
  homepage "https://github.com/desplega-ai/ai-toolbox"
  version "X.X.X"  # Get from latest release
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/desplega-ai/ai-toolbox/releases/download/file-review-v#{version}/file-review-darwin-arm64"
      sha256 "SHA256_FROM_RELEASE"
    end
    on_intel do
      url "https://github.com/desplega-ai/ai-toolbox/releases/download/file-review-v#{version}/file-review-darwin-x86_64"
      sha256 "SHA256_FROM_RELEASE"
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

### To get SHA256 values:
Use the GitHub MCP tools to fetch the `.sha256` files from the latest release, or use:
```bash
gh release view file-review-v1.0.2 --repo desplega-ai/ai-toolbox --json assets
```

---
