---
date: 2026-01-09T14:30:00-08:00
researcher: Claude
git_commit: e616532d713c40f206a01f26e6ae3f25c1edff27
branch: main
repository: ai-toolbox
topic: "Global Git Hooks Compatibility"
tags: [research, git, hooks, husky, pre-commit, lint-staged, core.hooksPath]
status: complete
last_updated: 2026-01-09
last_updated_by: Claude
---

# Research: Global Git Hooks Compatibility

**Date**: 2026-01-09T14:30:00-08:00
**Researcher**: Claude
**Git Commit**: e616532d713c40f206a01f26e6ae3f25c1edff27
**Branch**: main
**Repository**: ai-toolbox

## Research Question

What are the implications of setting `git config --global core.hooksPath` for tracking commits across all repos? Specifically:
1. How does global core.hooksPath affect per-repo hooks?
2. What popular tools use local .git/hooks (husky, pre-commit, lint-staged)?
3. Are there workarounds to support both global and local hooks?
4. Alternative approaches to global git hook installation

## Summary

Setting `git config --global core.hooksPath` **completely overrides** local repository hooks - it does not run both. This causes compatibility issues with popular tools like Husky, pre-commit, and lint-staged that rely on `.git/hooks`. However, workarounds exist: the global hook can manually delegate to local hooks, or alternative approaches like `init.templateDir` can be used. For AI code tracking scenarios, the delegation pattern is the recommended approach.

---

## Detailed Findings

### 1. How Global core.hooksPath Affects Per-Repo Hooks

**Critical Behavior: Complete Override, Not Addition**

When you set `git config --global core.hooksPath ~/.config/git-hooks`, Git uses ONLY the hooks from that directory. Local hooks in `.git/hooks/` are **completely ignored**.

From Git documentation:
> By default the hooks directory is `$GIT_DIR/hooks`, but that can be changed via the `core.hooksPath` configuration variable.

This is a **replacement**, not an addition. Many developers are surprised by this:

> "I had some projects that had project specific pre-push hooks that I expected to still be running before a push was executed. I had assumed that adding these global hooks would be in addition to the project hooks, not overriding them."

**Implications:**
- Any existing `.git/hooks/pre-commit`, `.git/hooks/post-commit`, etc. will not execute
- Tools that install hooks to `.git/hooks/` will silently break
- This affects ALL repositories on the system (when set globally)

**Per-Repository Override:**
You can restore default behavior for a specific repo:
```bash
# In the repo where you want local hooks to work
git config --local core.hooksPath .git/hooks
```

---

### 2. Popular Tools Using Local .git/hooks

#### Husky (JavaScript/Node.js)

[Husky](https://typicode.github.io/husky/) is the most popular Git hooks manager for JavaScript projects.

**How it works:**
- Creates hooks in `.husky/` directory
- Uses `git config core.hooksPath .husky` to redirect hooks
- Integrates with npm's `prepare` script for automatic installation

**Conflict with global hooksPath:**
- If a global `core.hooksPath` is already set, Husky's local setting is overridden by the global config
- GitHub issue [#391](https://github.com/typicode/husky/issues/391) documents this problem
- Commenting out global `core.hooksPath` allows Husky to work, but users want both

**Notable behavior:**
- Husky can be globally disabled with `HUSKY=0` environment variable
- Does not use `.git/hooks` directly; uses its own `.husky/` directory

#### pre-commit (Python)

[pre-commit](https://pre-commit.com/) is a multi-language framework for managing pre-commit hooks.

**How it works:**
- Installs to `.git/hooks/pre-commit` by default
- Configured via `.pre-commit-config.yaml`
- Manages tool installations automatically from Git repositories

**Conflict with global hooksPath:**
- Setting global `core.hooksPath` causes pre-commit to fail with: "Cowardly refusing to install hooks"
- GitHub issue [#1198](https://github.com/pre-commit/pre-commit/issues/1198) tracks this

**Installation command:**
```bash
pre-commit install  # Installs to .git/hooks/pre-commit
```

#### lint-staged (JavaScript)

[lint-staged](https://github.com/lint-staged/lint-staged) runs linters only on staged files.

**How it works:**
- Typically paired with Husky for hook management
- Runs commands defined in `package.json` or `.lintstagedrc.json`
- Only processes files in `git add` staging area

**Dependency chain:**
```
git commit
  -> Husky pre-commit hook
    -> lint-staged
      -> ESLint, Prettier, etc.
```

**Not a hooks manager itself** - relies on Husky or similar to trigger it.

#### Lefthook (Go)

[Lefthook](https://github.com/evilmartians/lefthook) is a fast, dependency-free Git hooks manager.

**How it works:**
- Single Go binary, no runtime dependencies
- Configured via `lefthook.yml`
- Supports parallel execution of commands

**Notable features:**
- Supports `lefthook-local.yml` for personal overrides (not committed)
- Remote configuration for sharing across repositories
- Does not require Node.js or Python

---

### 3. Workarounds to Support Both Global and Local Hooks

#### Pattern 1: Delegation from Global to Local

The recommended approach: have global hooks check for and execute local hooks.

```bash
#!/bin/bash
# ~/.config/git-hooks/pre-commit

# === Global hook logic ===
# Your global pre-commit tasks here
echo "Running global pre-commit hook..."

# === Delegate to local hooks ===
# Check for local hook in standard location
if [ -f ".git/hooks/pre-commit" ]; then
    echo "Running local pre-commit hook..."
    .git/hooks/pre-commit
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "Local pre-commit hook failed"
        exit $exit_code
    fi
fi

# Check for Husky hooks
if [ -f ".husky/pre-commit" ]; then
    echo "Running Husky pre-commit hook..."
    .husky/pre-commit
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "Husky pre-commit hook failed"
        exit $exit_code
    fi
fi

exit 0
```

**Advantages:**
- Works with any local hook setup
- Global hooks run first, local hooks run after
- Can choose to run local before or after global

**Disadvantages:**
- Must maintain delegation logic for each hook type
- Requires updating if new hook locations are added

#### Pattern 2: Using git-hooks-core

[pivotal-cf/git-hooks-core](https://github.com/pivotal-cf/git-hooks-core) provides an opinionated solution:

- Retains repository-specific hooks in `.git/hooks`
- Adds global hooks in `.d` folders (e.g., `pre-commit.d/`)
- Supports multiple hook files instead of single files

#### Pattern 3: rycus86/githooks

[githooks](https://github.com/rycus86/githooks) offers per-repo and global Git hooks with version control:

- Supports multiple scope levels: project, user, and global
- Shared repositories via `githooks.shared` config
- Version-controlled hooks with automatic updates

#### Pattern 4: Per-Repo Override

For specific repos that need local hooks only:

```bash
# In the repository directory
git config --local core.hooksPath .git/hooks
```

This overrides the global setting for that repo only.

---

### 4. Alternative Approaches to Global Git Hook Installation

#### Alternative 1: init.templateDir (Template-Based)

Uses Git's template feature to copy hooks when repositories are created/cloned.

**Setup:**
```bash
# Create template directory
mkdir -p ~/.git-templates/hooks

# Add your hooks
cp your-hook ~/.git-templates/hooks/pre-commit
chmod +x ~/.git-templates/hooks/pre-commit

# Configure Git to use template
git config --global init.templatedir '~/.git-templates'
```

**Behavior:**
- Hooks are copied to `.git/hooks/` on `git init` or `git clone`
- Does NOT override existing hooks (won't overwrite if already present)
- Updates to template don't affect existing repositories

**Advantages:**
- Compatible with all local hook tools (Husky, pre-commit, etc.)
- Local hooks remain in `.git/hooks/` where tools expect them

**Disadvantages:**
- Must run `git init` in existing repos to apply
- Changes to template require re-running `git init` everywhere
- Not truly "global" - just a convenient default

#### Alternative 2: Symbolic Links

Create symlinks from `.git/hooks/` to a central location:

```bash
# In each repository
find .git/hooks -type l -exec rm {} \;
ln -sf ~/path/to/global/pre-commit .git/hooks/pre-commit
```

**Can be automated** with a setup script or the template directory.

#### Alternative 3: Environment Variables

Some hooks can check environment variables:

```bash
#!/bin/bash
# Global hook checks for opt-out
if [ "$SKIP_GLOBAL_HOOKS" = "1" ]; then
    exit 0
fi
# ... rest of hook
```

#### Alternative 4: Wrapper Script Approach

Instead of setting `core.hooksPath`, create wrapper commands:

```bash
# ~/.local/bin/git-commit (or alias)
#!/bin/bash
# Run pre-commit checks
~/.config/git-hooks/pre-commit
if [ $? -ne 0 ]; then
    exit 1
fi
# Delegate to real git
/usr/bin/git commit "$@"
```

**Not recommended** - breaks IDE integrations and standard workflows.

---

## Recommendations for AI Code Tracking

Based on this research and the existing `/Users/taras/Documents/code/ai-toolbox/thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md` document:

### Recommended Approach: Delegation Pattern

For tracking AI vs human code changes globally:

1. **Set global hooks with delegation:**
```bash
git config --global core.hooksPath ~/.config/git-hooks
```

2. **Create hooks that delegate to local:**
```bash
#!/bin/bash
# ~/.config/git-hooks/post-commit

# === AI tracking logic ===
~/.config/ai-tracker/log-git-commit.sh

# === Delegate to local hooks ===
for hook in .git/hooks/post-commit .husky/post-commit; do
    if [ -x "$hook" ]; then
        "$hook"
    fi
done
```

3. **For repos with critical local hooks**, set local override:
```bash
# In that repo
git config --local core.hooksPath .git/hooks
```

### Existing Implementation Reference

The codebase has a hooks implementation in `/Users/taras/Documents/code/ai-toolbox/wts/src/integrations/hooks.ts` that:
- Installs post-checkout hooks to `.git/hooks/`
- Checks for existing hooks before overwriting
- Uses "wts post-checkout hook" comment as a signature

This implementation would be affected by global `core.hooksPath` and would need the delegation pattern to work properly.

---

## Code References

- `/Users/taras/Documents/code/ai-toolbox/wts/src/integrations/hooks.ts` - Existing hooks implementation in codebase
- `/Users/taras/Documents/code/ai-toolbox/thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md` - Related research on AI code tracking

## External Resources

- [Git hooks documentation](https://git-scm.com/docs/githooks)
- [Husky documentation](https://typicode.github.io/husky/)
- [pre-commit framework](https://pre-commit.com/)
- [lint-staged](https://github.com/lint-staged/lint-staged)
- [Lefthook](https://github.com/evilmartians/lefthook)
- [git-hooks-core](https://github.com/pivotal-cf/git-hooks-core)
- [rycus86/githooks](https://github.com/rycus86/githooks)

## Summary Table

| Approach | Pros | Cons |
|----------|------|------|
| `core.hooksPath` with delegation | Works globally, runs both | Requires maintenance |
| `init.templateDir` | Compatible with local tools | Not dynamic, requires re-init |
| Per-repo override | Selective | Manual setup per repo |
| Third-party tools (githooks) | Feature-rich | Additional dependency |

## Open Questions

1. How do CI/CD systems handle global vs local hooks?
2. What is the performance impact of checking multiple hook locations?
3. Should the delegation pattern run local hooks before or after global hooks?
