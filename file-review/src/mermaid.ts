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
import { icons, type IconName } from "./icons";
import { downloadSvg, openLightbox } from "./lightbox";

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
let toastFn: (message: string, type?: "success" | "info" | "error") => void = () => {};

/**
 * Wire in the host's theme accessor and toast. Called once at app boot from
 * main.ts so mermaid can read the current theme without importing app state.
 */
export function initMermaid(
  getTheme: () => Theme,
  toast?: (message: string, type?: "success" | "info" | "error") => void,
): void {
  getThemeFn = getTheme;
  if (toast) toastFn = toast;
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

  // Not gated on `signal`: an aborted run that finishes last may have
  // replaced the toolbar a newer run added, so every run re-checks.
  for (const node of validNodes) addDiagramToolbar(node);
}

function toolButton(action: string, icon: IconName, label: string): string {
  return `<button type="button" class="diagram-tool-btn" data-action="${action}" aria-label="${label}" title="${label}">${icons[icon]}</button>`;
}

/** Hover toolbar (expand, copy source, download) on a rendered diagram. */
function addDiagramToolbar(node: HTMLElement): void {
  if (!node.isConnected || node.querySelector(":scope > .diagram-toolbar")) return;
  if (!node.querySelector(":scope > svg")) return;

  const toolbar = document.createElement("div");
  toolbar.className = "diagram-toolbar";
  toolbar.innerHTML =
    toolButton("expand", "maximize", "Expand diagram") +
    toolButton("copy", "copy", "Copy diagram source") +
    toolButton("download", "download", "Download SVG");

  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("button[data-action]");
    if (!btn) return;
    // Keep the click away from the comment handlers on the diagram block.
    e.preventDefault();
    e.stopPropagation();
    void runDiagramAction(node, btn.dataset.action ?? "");
  });
  node.appendChild(toolbar);
}

async function runDiagramAction(node: HTMLElement, action: string): Promise<void> {
  const svg = node.querySelector<SVGElement>(":scope > svg");
  if (!svg) return;
  const root = node.closest("#preview-container") ?? document;
  const caption = `Diagram ${Array.from(root.querySelectorAll(".mermaid")).indexOf(node) + 1}`;
  try {
    switch (action) {
      case "expand":
        openLightbox({
          kind: "svg",
          svg: svg.cloneNode(true) as SVGElement,
          caption,
          source: nodeSource(node),
        });
        break;
      case "copy":
        await navigator.clipboard.writeText(nodeSource(node));
        toastFn("Diagram source copied", "success");
        break;
      case "download":
        await downloadSvg(svg, caption);
        break;
    }
  } catch (error) {
    console.error(`Diagram action ${action} failed:`, error);
    toastFn(`Diagram ${action} failed`, "error");
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
  // Keep comment anchoring and highlight state so the block stays commentable
  // and its existing comments stay visible.
  for (const attr of [
    "data-commentable",
    "data-source-start",
    "data-source-end",
    "data-comment-id",
    "data-comment-ids",
  ]) {
    const value = node.getAttribute(attr);
    if (value !== null) block.setAttribute(attr, value);
  }
  for (const cls of node.classList) {
    if (cls.startsWith("review-comment-") || cls === "preview-active") block.classList.add(cls);
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
