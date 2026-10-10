/**
 * Mermaid integration for the markdown preview.
 *
 * Lazy-loads the `mermaid` library on first use (so the bundler can split it
 * into its own chunk), renders `<pre class="mermaid">` blocks to inline SVG,
 * and re-renders idempotently when the preview is updated or theme is toggled.
 *
 * Design rules (see step-4 plan):
 * - Render is fire-and-forget — `updatePreview` stays synchronous. Each call
 *   passes an `AbortSignal`; only the latest call wins.
 * - Sticky failure: if the dynamic import or initial setup fails, future
 *   `getMermaid()` calls reject with a `MermaidLoadError` and we render a
 *   `.mermaid-error` banner inline instead of looping forever.
 * - Theme awareness: `mermaid.initialize` is called once on first import. If
 *   the theme changes later, we re-initialize before the next `run` and
 *   `resetMermaidProcessed` strips `data-processed` so the diagrams re-render.
 */

import type { default as MermaidAPI } from "mermaid";
import type { Theme } from "./theme";

type MermaidModule = typeof MermaidAPI;

export class MermaidLoadError extends Error {
  readonly cause?: unknown;
  constructor(cause: unknown) {
    super(`Mermaid failed to load: ${String(cause)}`);
    this.name = "MermaidLoadError";
    this.cause = cause;
  }
}

let mermaidPromise: Promise<MermaidModule> | null = null;
let mermaidLoadFailed = false;
let lastAppliedTheme: Theme | null = null;
let getThemeFn: () => Theme = () => "dark";

/**
 * Wire in the host's theme accessor. Called once at app boot from main.ts so
 * mermaid can read the current theme without importing app state directly.
 */
export function initMermaid(getTheme: () => Theme): void {
  getThemeFn = getTheme;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mermaidThemeFor(theme: Theme): "dark" | "default" {
  return theme === "dark" ? "dark" : "default";
}

/**
 * Lazy-load mermaid. Subsequent calls return the cached promise.
 * On first successful load, `mermaid.initialize` is called with the current
 * theme. On any failure the loader becomes "stuck failed" — `MermaidLoadError`
 * is thrown for every subsequent call until the page reloads.
 */
export async function getMermaid(): Promise<MermaidModule> {
  if (mermaidLoadFailed) {
    throw new MermaidLoadError("previous load attempt failed");
  }
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid")
      .then((m) => {
        const theme = getThemeFn();
        m.default.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: mermaidThemeFor(theme),
        });
        lastAppliedTheme = theme;
        return m.default;
      })
      .catch((err) => {
        mermaidLoadFailed = true;
        mermaidPromise = null;
        throw new MermaidLoadError(err);
      });
  }
  return mermaidPromise;
}

/**
 * Render every unprocessed `.mermaid` block in `container`. Idempotent — once
 * mermaid stamps `data-processed="true"` on a node, we skip it on the next
 * call. The `signal` short-circuits the work if a newer render has started.
 */
export async function renderMermaidBlocks(
  container: HTMLElement,
  signal?: AbortSignal,
): Promise<void> {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(
      '.mermaid:not([data-processed="true"])',
    ),
  );
  if (nodes.length === 0) return;

  let mermaid: MermaidModule;
  try {
    mermaid = await getMermaid();
  } catch (err) {
    if (err instanceof MermaidLoadError) {
      const message = escapeHtml(String(err.cause ?? err.message));
      for (const node of nodes) {
        node.outerHTML =
          `<div class="mermaid-error">Diagram rendering unavailable (${message})</div>`;
      }
      return;
    }
    console.error("mermaid getMermaid failed", err);
    return;
  }

  if (signal?.aborted) return;

  // Re-initialize if the theme changed since last load. Mermaid honors the new
  // theme on the next `run` call.
  const currentTheme = getThemeFn();
  if (lastAppliedTheme !== currentTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: mermaidThemeFor(currentTheme),
    });
    lastAppliedTheme = currentTheme;
  }

  // Validate each diagram first so syntax errors render our own error block
  // instead of mermaid's built-in error graphic.
  const validNodes: HTMLElement[] = [];
  const invalid: Array<{ node: HTMLElement; source: string; error: unknown }> = [];
  for (const node of nodes) {
    const source = nodeSource(node);
    try {
      await mermaid.parse(source);
      validNodes.push(node);
    } catch (error) {
      invalid.push({ node, source, error });
    }
  }

  if (signal?.aborted) return;

  for (const { node, source, error } of invalid) {
    node.replaceWith(createSyntaxErrorBlock(node, source, error));
  }

  if (validNodes.length === 0) return;

  try {
    await mermaid.run({ nodes: validNodes, suppressErrors: true });
  } catch (err) {
    // Sources were validated above; anything thrown here is unexpected.
    console.error("mermaid.run failed", err);
  }
}

function nodeSource(node: HTMLElement): string {
  const src = node.getAttribute("data-src");
  if (src !== null) {
    try {
      return decodeURIComponent(src);
    } catch {
      // Malformed data-src: fall back to the escaped text content.
    }
  }
  return node.textContent ?? "";
}

function createSyntaxErrorBlock(
  node: HTMLElement,
  source: string,
  error: unknown,
): HTMLElement {
  const message = error instanceof Error ? error.message : String(error);
  const block = document.createElement("div");
  block.className = "mermaid-error";
  // Keep comment anchoring attributes so the block stays commentable.
  for (const attr of ["data-commentable", "data-source-start", "data-source-end"]) {
    const value = node.getAttribute(attr);
    if (value !== null) block.setAttribute(attr, value);
  }
  block.innerHTML =
    `<div class="mermaid-error-title">Diagram syntax error</div>` +
    `<pre class="mermaid-error-message">${escapeHtml(message)}</pre>` +
    `<details class="mermaid-error-source"><summary>Show source</summary>` +
    `<pre>${escapeHtml(source)}</pre></details>`;
  return block;
}

/**
 * Strip `data-processed` from every `.mermaid` node and restore the original
 * source from `data-src` so the next `renderMermaidBlocks` re-renders them.
 * Used by the theme toggle.
 */
export function resetMermaidProcessed(container: HTMLElement): void {
  const nodes = container.querySelectorAll<HTMLElement>(".mermaid");
  for (const node of nodes) {
    const src = node.getAttribute("data-src");
    if (src !== null) {
      node.removeAttribute("data-processed");
      try {
        node.innerHTML = escapeHtml(decodeURIComponent(src));
      } catch {
        // Malformed data-src — leave node alone; mermaid.run will skip it
        // because `data-processed` is now gone but innerHTML is unchanged.
      }
    }
  }
}
