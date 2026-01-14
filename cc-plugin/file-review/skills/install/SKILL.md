---
name: file-review-install
description: Install the file-review tool. Use when user needs to install file-review on a new machine or asks how to set it up.
---

# Install File Review

Guide for installing the file-review tool.

## Quick Install (Homebrew)

For macOS and Linux with Homebrew installed:

```bash
brew tap desplega-ai/tap
brew install file-review
```

Verify installation:
```bash
which file-review
```

If Homebrew is not available on the platform, use the manual installation below.

---

## Manual Installation (from source)

Use this method if Homebrew is unavailable or you prefer building from source.

### Prerequisites

Ensure the user has:
- **bun** - JavaScript runtime
- **Rust** - Rust toolchain with cargo

If missing, provide installation commands:
```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/desplega-ai/ai-toolbox.git
   cd ai-toolbox/file-review
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Build and install the binary:**
   ```bash
   bun run install:app
   ```

   This builds the Tauri app and symlinks it to `~/.local/bin/file-review`.

4. **Ensure ~/.local/bin is in PATH** (add to `~/.zshrc` if needed):
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

5. **Verify installation:**
   ```bash
   which file-review
   ```

## Troubleshooting

- **Command not found after install**: Ensure `~/.local/bin` is in your PATH and restart terminal
- **Rust not found**: Restart terminal after installing Rust
- **Build fails on macOS**: Install Xcode Command Line Tools: `xcode-select --install`

## Uninstall

```bash
cd ai-toolbox/file-review
bun run uninstall:app
```
