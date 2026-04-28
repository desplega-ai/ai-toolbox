---
id: step-4
name: Mermaid rendering in preview
depends_on: []
status: ready
---

<!-- During /v-implement, `desplega:step-running` adds `assignee` and `claimed_at` while
working, then transitions `status` to `done` (success) or back to `ready` (retry-able failure). -->

# step-4: Mermaid rendering in preview

## Overview

Render ` ```mermaid ` fenced code blocks as inline SVG diagrams in the markdown preview pane. Theme-aware (re-renders on light/dark toggle), idempotent across keystroke updates (no double-render), and gracefully shows an inline error message when the diagram syntax is invalid. Existing highlight.js fences for other languages keep working — mermaid blocks must be transformed **before** hljs runs, since hljs would otherwise wrap mermaid source in `<span>` tokens and break parsing. Independent of the tabs work — only touches `markdown-preview.ts`, a new `mermaid.ts` module, `package.json`, and the Tauri CSP.

## Changes Required:

#### 1. Add mermaid dependency + dynamic import (with failure guard)

**File**: `file-review/package.json`
**Changes**:
- Add `"mermaid": "^11"` to `dependencies`.
- Run `bun install`.

**File**: `file-review/src/mermaid.ts` (new)
**Changes**:
- Module-private `mermaidPromise: Promise<typeof import('mermaid').default> | null = null` and `mermaidLoadFailed = false`.
- Export `getMermaid()`: if `mermaidLoadFailed`, throw a sentinel `MermaidLoadError`. Else lazy `mermaidPromise ??= import('mermaid').then(m => { m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: getCurrentTheme() === 'dark' ? 'dark' : 'default' }); return m.default; }).catch(err => { mermaidLoadFailed = true; throw new MermaidLoadError(err); })`.
- Export `renderMermaidBlocks(container: HTMLElement, signal?: AbortSignal): Promise<void>`: queries `container.querySelectorAll<HTMLElement>('.mermaid:not([data-processed="true"])')`. If zero, return immediately. Else:
  ```ts
  try {
    const mermaid = await getMermaid();
    if (signal?.aborted) return;
    await mermaid.run({ nodes: Array.from(nodes), suppressErrors: true });
  } catch (err) {
    if (err instanceof MermaidLoadError) {
      // Inline-render a single banner replacing all unprocessed mermaid blocks
      for (const node of nodes) {
        node.outerHTML = `<div class="mermaid-error">Diagram rendering unavailable (${escapeHtml(String(err.cause))})</div>`;
      }
    } else {
      console.error('mermaid.run failed', err);
    }
  }
  ```
- Export `resetMermaidProcessed(container: HTMLElement)`: for theme switches — strips `data-processed`, restores `innerHTML` from `data-src` (decode). Caller follows up with `renderMermaidBlocks(container)` to re-render.
- After the import resolves, also reset `mermaid.initialize` if the theme changed since first load: keep last-applied theme in a module var; if it differs, call `initialize` again before `run`.

#### 2. marked walkTokens hook for mermaid blocks

**File**: `file-review/src/markdown-preview.ts`
**Changes**:
- Register a `walkTokens` hook **once at module scope** (NOT inside a render call — `marked.use()` inside a render recurses):
  ```ts
  marked.use({
    walkTokens(token) {
      if (token.type === 'code' && token.lang === 'mermaid') {
        // Mutate into an html token so the default code renderer is bypassed entirely.
        const t = token as Tokens.Code & { type: string; raw: string; pre?: boolean; text?: string };
        t.type = 'html';
        t.pre = false;
        t.text = `<pre class="mermaid" data-src="${encodeURIComponent(token.text)}">${escapeHtml(token.text)}</pre>`;
      }
    },
  });
  ```
  This approach is preferred over a `extensions[]` entry because it doesn't require a custom tokenizer and runs after the default lexer has already classified the fence — fewer ways to drift from `marked`'s code-fence parsing rules.
- **Fire-and-forget pattern with cancellation** in `updatePreview()` to avoid blocking keystroke renders:
  ```ts
  let activeMermaidController: AbortController | null = null;

  function updatePreview(content, comments) {
    // ... existing renderMarkdown / innerHTML write ...
    activeMermaidController?.abort(); // cancel any in-flight render
    activeMermaidController = new AbortController();
    void renderMermaidBlocks(previewContainer, activeMermaidController.signal);
    highlightCodeBlocks(); // unchanged, runs synchronously
  }
  ```
  `updatePreview` stays **synchronous**. Mermaid renders out-of-band; the latest call wins via `AbortSignal`. `highlightCodeBlocks` runs as before — since walkTokens already converted mermaid fences into `html` tokens, there's no longer a `<pre><code class="language-mermaid">` for hljs to mangle.

#### 3. Theme switching re-renders

**File**: `file-review/src/theme.ts` and `file-review/src/markdown-preview.ts`
**Changes**:
- After theme toggle (`updateTheme`), call `resetMermaidProcessed(previewContainer)` then `renderMermaidBlocks(previewContainer)`.
- Add a small `mermaid-error` CSS class for the error UI: red border, monospace, displays the source.

#### 4. CSS + CSP

**File**: `file-review/src/styles.css`
**Changes**:
- `.mermaid` container: centered, max-width parent, theme-aware background.
- `.mermaid-error`: distinct error styling.

**File**: `file-review/src-tauri/tauri.conf.json`
**Changes**:
- CSP: ensure `style-src 'self' 'unsafe-inline'` (mermaid injects `<style>` tags). If a `csp` entry exists, update; else add.

#### 5. Test fixture

**File**: `file-review/test-files/with-mermaid.md` (new)
**Changes**:
- Include several mermaid block types (`graph TD`, `sequenceDiagram`, `classDiagram`), one valid + one intentionally broken to verify error UI, plus normal code fences (TypeScript, Bash) so we confirm hljs still handles them.

### Success Criteria:

#### Automated Verification:
- [ ] Typecheck passes: `cd file-review && bun run check`
- [ ] Build passes: `cd file-review && bun run build`
- [ ] Bundle inspection: `ls -la file-review/dist/assets/ | grep mermaid` shows mermaid is split into its own chunk (dynamic-imported, not inlined into main bundle)
- [ ] Tauri config validates: `cd file-review/src-tauri && cargo build` (catches CSP issues)

#### Automated QA:
- [ ] Sub-agent launches `bun run dev:web file-review/test-files/with-mermaid.md`, screenshots the preview, confirms: SVG diagrams visible (not raw mermaid source), TypeScript fence still hljs-styled, broken mermaid block shows the `mermaid-error` div with a parseable error message
- [ ] Sub-agent edits a mermaid block (one keystroke), confirms preview re-renders the diagram without flicker AND without two stacked SVGs
- [ ] Sub-agent toggles theme (Cmd+Shift+T), confirms diagrams re-render with the new theme colors (compare two screenshots)
- [ ] Sub-agent confirms console has no errors related to mermaid

#### Manual Verification:
- [ ] On a Tauri build (not just dev:web), CSP doesn't block mermaid styles — open `bun run dev`, view a mermaid file, confirm SVGs render

**Implementation Note**: This step is a vertical slice — QA-able on its own. After completing this step, pause for manual confirmation. After verification passes, commit with `[step-4] Mermaid diagram rendering in preview`.
