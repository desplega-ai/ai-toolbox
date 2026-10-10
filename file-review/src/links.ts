import { API, isTauri } from "./api";
import { flashElement, getPreviewContainer, slugify } from "./markdown-preview";
import { openLightbox, type LightboxImage } from "./lightbox";
import { icons } from "./icons";
import type { Tab } from "./tabs";

export type LinkKind = "anchor" | "doc" | "file" | "external" | "unsupported";

export interface ResolvedLink {
  kind: LinkKind;
  /** Absolute filesystem path (doc and file). */
  path?: string;
  /** Decoded fragment without the leading `#`. */
  fragment?: string;
  /** Full URL (external), or the raw href (unsupported). */
  url?: string;
}

const DOC_EXTENSIONS = new Set(["md", "markdown", "mdx", "txt"]);
const EXTERNAL_SCHEMES = new Set(["http", "https", "mailto"]);
const REMOTE_IMAGE_SRC = /^(https?:|data:|blob:)/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Collapse `.`, `..` and repeated slashes in an absolute POSIX path. */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return `/${out.join("/")}`;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

function classifyPath(path: string, fragment: string | undefined): ResolvedLink {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const kind = DOC_EXTENSIONS.has(ext) ? "doc" : "file";
  return fragment === undefined ? { kind, path } : { kind, path, fragment };
}

/**
 * Classify an href from the preview and resolve local targets to absolute
 * paths relative to the file that contains the link.
 */
export function resolveHref(href: string, currentFilePath: string | null): ResolvedLink {
  const raw = href.trim();
  const hashIdx = raw.indexOf("#");
  const fragment = hashIdx >= 0 ? safeDecode(raw.slice(hashIdx + 1)) : undefined;
  const beforeHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const withoutQuery = beforeHash.replace(/\?.*$/, "");

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(beforeHash)?.[1].toLowerCase();
  if (scheme) {
    if (EXTERNAL_SCHEMES.has(scheme)) return { kind: "external", url: raw };
    if (scheme === "file") {
      // file:///abs/path or file://host/abs/path; the host is ignored.
      let rest = withoutQuery.slice("file:".length);
      if (rest.startsWith("//")) {
        const slash = rest.indexOf("/", 2);
        rest = slash >= 0 ? rest.slice(slash) : "/";
      }
      return classifyPath(normalizePath(safeDecode(rest)), fragment);
    }
    return { kind: "unsupported", url: raw };
  }

  if (beforeHash.startsWith("//")) return { kind: "external", url: `https:${raw}` };

  if (withoutQuery === "") {
    return fragment === undefined ? { kind: "unsupported", url: raw } : { kind: "anchor", fragment };
  }

  const decoded = safeDecode(withoutQuery);
  if (decoded.startsWith("/")) return classifyPath(normalizePath(decoded), fragment);
  if (!currentFilePath) return { kind: "unsupported", url: raw };
  return classifyPath(normalizePath(`${dirname(currentFilePath)}/${decoded}`), fragment);
}

/** Human-readable destination shown as the link tooltip. */
export function describeLink(link: ResolvedLink, href: string): string {
  switch (link.kind) {
    case "anchor":
      return `#${link.fragment ?? ""}`;
    case "doc":
    case "file":
      return link.fragment ? `${link.path}#${link.fragment}` : link.path ?? href;
    case "external":
      return link.url ?? href;
    default:
      return href;
  }
}

interface LinkRouterDeps {
  getActiveTab: () => Tab | null;
  /** Open `path` as a tab (or switch to it). Rejects if it cannot be read. */
  openDoc: (path: string) => Promise<void>;
  toast: (message: string, type?: "success" | "info" | "error") => void;
}

let deps: LinkRouterDeps | null = null;

function currentPath(): string | null {
  return deps?.getActiveTab()?.path ?? null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Wire link and image clicks. One capturing listener on the document sees
 * every `a[href]` click in the app, so nothing can navigate the webview away.
 */
export function initLinkRouter(routerDeps: LinkRouterDeps): void {
  deps = routerDeps;
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("auxclick", onAuxClick, true);
}

function closestAnchor(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("a[href]") : null;
}

function onAuxClick(e: MouseEvent) {
  if (closestAnchor(e.target)) e.preventDefault();
}

function onDocumentClick(e: MouseEvent) {
  const anchor = closestAnchor(e.target);
  const plainClick = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

  if (anchor) {
    // Always block native navigation. Cmd/Ctrl+click keeps bubbling to the
    // preview, where it adds a comment instead of following the link.
    e.preventDefault();
    if (plainClick) void followHref(anchor.getAttribute("href") ?? "");
    return;
  }

  if (plainClick && e.target instanceof HTMLImageElement) {
    const container = getPreviewContainer();
    if (container?.contains(e.target)) openImage(container, e.target);
  }
}

function scrollToFragment(fragment: string): void {
  const container = getPreviewContainer();
  if (!container) return;
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  if (fragment === "") {
    container.scrollTo({ top: 0, behavior });
    return;
  }
  const el =
    container.querySelector<HTMLElement>(`#${CSS.escape(fragment)}`) ??
    container.querySelector<HTMLElement>(`#${CSS.escape(slugify(fragment))}`);
  if (!el) {
    deps?.toast(`No heading #${fragment} in this file`, "info");
    return;
  }
  el.scrollIntoView({ behavior, block: "start" });
  flashElement(el);
}

/** Open a local document as a tab (or switch to it), then scroll to `fragment`. */
export async function openDocument(path: string, fragment?: string): Promise<void> {
  if (!deps) return;
  if (path !== currentPath()) {
    try {
      await deps.openDoc(path);
    } catch (error) {
      console.error("Failed to open linked file:", path, error);
      deps.toast(`File not found: ${path}`, "error");
      return;
    }
  }
  const tab = deps.getActiveTab();
  if (fragment && tab?.isMarkdownFile && !tab.isRawMode) {
    // Let the new tab's preview land before looking for the heading.
    requestAnimationFrame(() => scrollToFragment(fragment));
  }
}

/** Follow an href the way a click on a preview link does. */
export async function followHref(href: string): Promise<void> {
  if (!deps) return;
  const link = resolveHref(href, currentPath());

  switch (link.kind) {
    case "anchor":
      scrollToFragment(link.fragment ?? "");
      return;

    case "doc":
      await openDocument(link.path!, link.fragment);
      return;

    case "file":
      if (!isTauri()) {
        deps.toast(`Opening local files is not available in web mode: ${link.path}`, "info");
        return;
      }
      try {
        const result = await API.openPath(link.path!);
        if (result === "revealed") {
          deps.toast(`Revealed in Finder (not opened): ${link.path}`, "info");
        }
      } catch (error) {
        deps.toast(`Could not open ${link.path}: ${error instanceof Error ? error.message : error}`, "error");
      }
      return;

    case "external":
      try {
        await API.openExternal(link.url!);
      } catch (error) {
        deps.toast(`Could not open ${link.url}: ${error instanceof Error ? error.message : error}`, "error");
      }
      return;

    default:
      deps.toast(`Unsupported link: ${href}`, "info");
  }
}

// Existence checks for local link targets, cached per path. Cleared on tab
// switch and on save so the next render re-checks.
const existsCache = new Map<string, Promise<boolean>>();
let renderGeneration = 0;

export function invalidateLinkCache(): void {
  existsCache.clear();
}

export function checkExists(path: string): Promise<boolean> {
  let pending = existsCache.get(path);
  if (!pending) {
    // On a failed check, assume the target exists rather than flag it.
    pending = API.fileExists(path).catch(() => true);
    existsCache.set(path, pending);
  }
  return pending;
}

/**
 * Post-render pass over the preview: link tooltips, broken-link marks,
 * external-link marks, and local image sources.
 */
export function decoratePreview(container: HTMLElement): void {
  const generation = ++renderGeneration;
  const current = currentPath();

  container.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const link = resolveHref(href, current);
    if (!anchor.getAttribute("title")) anchor.setAttribute("title", describeLink(link, href));
    if (link.kind === "external") anchor.classList.add("link-external");
    if ((link.kind === "doc" || link.kind === "file") && link.path) {
      const path = link.path;
      void checkExists(path).then((exists) => {
        if (exists || generation !== renderGeneration) return;
        anchor.classList.add("link-broken");
        anchor.setAttribute("title", `Not found: ${path}`);
      });
    }
  });

  container.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => showMissingImage(img), { once: true });
    const original = img.getAttribute("src") ?? "";
    if (!original || REMOTE_IMAGE_SRC.test(original)) return;
    const link = resolveHref(original, current);
    if ((link.kind !== "doc" && link.kind !== "file") || !link.path) return;
    img.dataset.originalSrc = original;
    img.dataset.path = link.path;
    img.src = API.assetUrl(link.path);
  });
}

function showMissingImage(img: HTMLImageElement): void {
  const original = img.dataset.originalSrc ?? img.getAttribute("src") ?? "";
  const placeholder = document.createElement("span");
  placeholder.className = "img-missing";
  placeholder.title = img.dataset.path ? `Not found: ${img.dataset.path}` : "Image not found";
  placeholder.innerHTML = `${icons.image}<span class="img-missing-text"><span>Image not found</span><span class="img-missing-src"></span></span>`;
  placeholder.querySelector(".img-missing-src")!.textContent = original;
  img.replaceWith(placeholder);
}

function imageEntry(img: HTMLImageElement): LightboxImage {
  const original = img.dataset.originalSrc ?? img.getAttribute("src") ?? "";
  return {
    src: img.currentSrc || img.src,
    caption: img.alt.trim() || original,
    path: img.dataset.path,
  };
}

function openImage(container: HTMLElement, img: HTMLImageElement): void {
  const images = Array.from(container.querySelectorAll("img"));
  const index = Math.max(0, images.indexOf(img));
  const items = images.map(imageEntry);
  openLightbox({ kind: "image", ...items[index], items, index });
}
