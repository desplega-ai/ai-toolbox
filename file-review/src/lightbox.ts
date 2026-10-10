import { API, isTauri } from "./api";
import { icons } from "./icons";

/**
 * Full-screen viewer for preview images and SVG diagrams. One overlay is
 * reused; opening while open swaps the content.
 */

export interface LightboxImage {
  src: string;
  caption: string;
  /** Absolute local path, when the image comes from disk. */
  path?: string;
}

export type LightboxOptions =
  | ({ kind: "image"; items?: LightboxImage[]; index?: number } & LightboxImage)
  | { kind: "svg"; svg: SVGElement; caption: string; source?: string };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const STEP = 1.25;
const FIT_PADDING = 32;
const FADE_MS = 150;

interface State {
  options: LightboxOptions;
  items: LightboxImage[];
  index: number;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  fitScale: number;
  x: number;
  y: number;
  fitted: boolean;
}

let overlay: HTMLDivElement | null = null;
let stage: HTMLDivElement | null = null;
let content: HTMLDivElement | null = null;
let state: State | null = null;
let isOpen = false;
let restoreFocus: HTMLElement | null = null;
let closeTimer: number | undefined;
let gestureStartScale: number | null = null;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function actionButton(action: string, label: string, title: string, inner: string): string {
  return `<button type="button" class="lightbox-btn" data-action="${action}" aria-label="${label}" title="${title}">${inner}</button>`;
}

function buildOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `
    <div class="lightbox-header">
      <div class="lightbox-caption"></div>
      <div class="lightbox-actions">
        ${actionButton("zoom-out", "Zoom out", "Zoom out (-)", icons["zoom-out"])}
        <button type="button" class="lightbox-btn lightbox-zoom" data-action="fit" aria-label="Fit to screen" title="Fit to screen (0)">100%</button>
        ${actionButton("zoom-in", "Zoom in", "Zoom in (+)", icons["zoom-in"])}
        <span class="lightbox-divider" aria-hidden="true"></span>
        ${actionButton("copy-path", "Copy path", "Copy path", `${icons.copy}<span class="lightbox-btn-label">Copy path</span>`)}
        ${actionButton("reveal", "Reveal in Finder", "Reveal in Finder", `${icons.folder}<span class="lightbox-btn-label">Reveal in Finder</span>`)}
        ${actionButton("download", "Download SVG", "Download SVG", `${icons.download}<span class="lightbox-btn-label">Download SVG</span>`)}
        ${actionButton("close", "Close", "Close (Esc)", icons.x)}
      </div>
    </div>
    <div class="lightbox-stage">
      <div class="lightbox-content"></div>
    </div>
  `;

  el.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => void runAction(btn.dataset.action ?? "", btn));
  });

  const stageEl = el.querySelector<HTMLDivElement>(".lightbox-stage")!;
  stageEl.addEventListener("wheel", onWheel, { passive: false });
  stageEl.addEventListener("pointerdown", onPointerDown);
  stageEl.addEventListener("dblclick", onDoubleClick);
  // WebKit (Tauri on macOS) reports trackpad pinch as gesture events.
  stageEl.addEventListener("gesturestart", onGestureStart as EventListener);
  stageEl.addEventListener("gesturechange", onGestureChange as EventListener);
  stageEl.addEventListener("gestureend", onGestureEnd as EventListener);
  return el;
}

export function openLightbox(options: LightboxOptions): void {
  if (!overlay) {
    overlay = buildOverlay();
    stage = overlay.querySelector<HTMLDivElement>(".lightbox-stage");
    content = overlay.querySelector<HTMLDivElement>(".lightbox-content");
  }
  window.clearTimeout(closeTimer);

  const wasOpen = isOpen;
  if (!wasOpen) {
    isOpen = true;
    restoreFocus = document.activeElement as HTMLElement | null;
    if (!overlay.isConnected) document.body.appendChild(overlay);
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("resize", onResize);
  }

  const items = options.kind === "image" ? (options.items ?? [options]) : [];
  const index = options.kind === "image" ? Math.max(0, options.index ?? 0) : 0;
  state = {
    options,
    items,
    index,
    naturalWidth: 0,
    naturalHeight: 0,
    scale: 1,
    fitScale: 1,
    x: 0,
    y: 0,
    fitted: true,
  };
  renderContent();

  if (!wasOpen) {
    // Next frame so the opacity transition runs from 0.
    requestAnimationFrame(() => overlay?.classList.add("lightbox-visible"));
    overlay.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
  }
}

export function closeLightbox(): void {
  if (!isOpen || !overlay) return;
  isOpen = false;
  const el = overlay;
  el.classList.remove("lightbox-visible");
  window.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("resize", onResize);
  state = null;
  closeTimer = window.setTimeout(() => {
    el.remove();
    if (content) content.innerHTML = "";
  }, prefersReducedMotion() ? 0 : FADE_MS);
  if (restoreFocus?.isConnected) restoreFocus.focus();
  restoreFocus = null;
}

function currentImage(): LightboxImage | null {
  if (!state || state.options.kind !== "image") return null;
  return state.items[state.index] ?? null;
}

function renderContent() {
  if (!overlay || !content || !state) return;
  const { options } = state;
  const isImage = options.kind === "image";
  const image = currentImage();

  const caption = image?.caption ?? options.caption;
  const captionEl = overlay.querySelector<HTMLElement>(".lightbox-caption")!;
  captionEl.textContent = caption;
  if (state.items.length > 1) {
    const counter = document.createElement("span");
    counter.className = "lightbox-counter";
    counter.textContent = `${state.index + 1} / ${state.items.length}`;
    captionEl.appendChild(counter);
  }
  overlay.setAttribute("aria-label", caption || (isImage ? "Image" : "Diagram"));

  setHidden("copy-path", !isImage);
  setHidden("reveal", !isImage || !isTauri() || !image?.path);
  setHidden("download", isImage);

  content.innerHTML = "";
  content.classList.toggle("is-svg", !isImage);

  if (image) {
    const img = document.createElement("img");
    img.alt = image.caption;
    img.draggable = false;
    const onReady = () => {
      if (state && currentImage() === image) setNaturalSize(img.naturalWidth, img.naturalHeight);
    };
    img.addEventListener("load", onReady, { once: true });
    img.addEventListener(
      "error",
      () => {
        content?.replaceChildren(
          Object.assign(document.createElement("div"), {
            className: "lightbox-error",
            textContent: "Image failed to load",
          })
        );
        setNaturalSize(240, 48);
      },
      { once: true }
    );
    img.src = image.src;
    content.appendChild(img);
    if (img.complete && img.naturalWidth > 0) onReady();
  } else if (options.kind === "svg") {
    const clone = options.svg.cloneNode(true) as SVGElement;
    const { width, height } = svgSize(options.svg);
    clone.removeAttribute("style");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    content.appendChild(clone);
    const padding = 16;
    setNaturalSize(width + padding * 2, height + padding * 2);
  }
}

function setHidden(action: string, hidden: boolean) {
  const btn = overlay?.querySelector<HTMLElement>(`[data-action="${action}"]`);
  if (btn) btn.hidden = hidden;
}

function svgSize(svg: SVGElement): { width: number; height: number } {
  const viewBox = (svg as SVGSVGElement).viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
  return { width: 800, height: 600 };
}

function setNaturalSize(width: number, height: number) {
  if (!state || !content) return;
  state.naturalWidth = width || 1;
  state.naturalHeight = height || 1;
  content.style.width = `${state.naturalWidth}px`;
  content.style.height = `${state.naturalHeight}px`;
  fit();
}

function stageSize(): { width: number; height: number } {
  const rect = stage?.getBoundingClientRect();
  return { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight };
}

function computeFitScale(): number {
  if (!state) return 1;
  const { width, height } = stageSize();
  const scale = Math.min(
    (width - FIT_PADDING * 2) / state.naturalWidth,
    (height - FIT_PADDING * 2) / state.naturalHeight
  );
  // Never blow small raster images up past 100%; diagrams scale cleanly.
  const capped = state.options.kind === "image" ? Math.min(scale, 1) : scale;
  return Math.min(MAX_ZOOM, Math.max(0.01, capped));
}

function fit() {
  if (!state) return;
  const { width, height } = stageSize();
  state.fitScale = computeFitScale();
  state.scale = state.fitScale;
  state.x = (width - state.naturalWidth * state.scale) / 2;
  state.y = (height - state.naturalHeight * state.scale) / 2;
  state.fitted = true;
  applyTransform();
}

/** Zoom to `next`, keeping the stage point (cx, cy) fixed under the cursor. */
function zoomAt(next: number, cx: number, cy: number) {
  if (!state) return;
  const min = Math.min(MIN_ZOOM, state.fitScale);
  const scale = Math.min(MAX_ZOOM, Math.max(min, next));
  const ratio = scale / state.scale;
  state.x = cx - (cx - state.x) * ratio;
  state.y = cy - (cy - state.y) * ratio;
  state.scale = scale;
  state.fitted = false;
  applyTransform();
}

function zoomAtCenter(next: number) {
  const { width, height } = stageSize();
  zoomAt(next, width / 2, height / 2);
}

function stagePoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const rect = stage!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function applyTransform() {
  if (!state || !content || !overlay) return;
  content.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  const readout = overlay.querySelector<HTMLElement>(".lightbox-zoom");
  if (readout) readout.textContent = `${Math.round(state.scale * 100)}%`;
}

function onWheel(e: WheelEvent) {
  if (!state) return;
  e.preventDefault();
  if (gestureStartScale !== null) return;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stageSize().height : 1;
  // ctrlKey marks a trackpad pinch in Chromium; it sends small deltas.
  const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.002));
  const p = stagePoint(e);
  zoomAt(state.scale * factor, p.x, p.y);
}

interface GestureLikeEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

function onGestureStart(e: GestureLikeEvent) {
  e.preventDefault();
  gestureStartScale = state?.scale ?? 1;
}

function onGestureChange(e: GestureLikeEvent) {
  e.preventDefault();
  if (gestureStartScale === null) return;
  const p = stagePoint(e);
  zoomAt(gestureStartScale * e.scale, p.x, p.y);
}

function onGestureEnd(e: GestureLikeEvent) {
  e.preventDefault();
  gestureStartScale = null;
}

function onPointerDown(e: PointerEvent) {
  if (!state || !stage || e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const originX = state.x;
  const originY = state.y;
  const target = e.target;
  let moved = false;
  stage.setPointerCapture(e.pointerId);
  stage.classList.add("is-panning");

  const onMove = (ev: PointerEvent) => {
    if (!state) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    state.x = originX + dx;
    state.y = originY + dy;
    state.fitted = false;
    applyTransform();
  };
  const onUp = () => {
    stage?.removeEventListener("pointermove", onMove);
    stage?.removeEventListener("pointerup", onUp);
    stage?.removeEventListener("pointercancel", onUp);
    stage?.classList.remove("is-panning");
    // A plain click on the empty backdrop closes the viewer.
    if (!moved && target === stage) closeLightbox();
  };
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
}

function onDoubleClick(e: MouseEvent) {
  if (!state) return;
  e.preventDefault();
  if (state.fitted && Math.abs(state.fitScale - 1) > 0.01) {
    const p = stagePoint(e);
    zoomAt(1, p.x, p.y);
  } else {
    fit();
  }
}

function onResize() {
  if (state?.fitted) fit();
}

function cycle(direction: 1 | -1) {
  if (!state || state.items.length < 2) return;
  state.index = (state.index + direction + state.items.length) % state.items.length;
  renderContent();
}

function trapFocus(e: KeyboardEvent) {
  if (!overlay) return;
  const focusable = Array.from(
    overlay.querySelectorAll<HTMLButtonElement>("button:not([hidden])")
  );
  if (focusable.length === 0) return;
  e.preventDefault();
  const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
  const step = e.shiftKey ? -1 : 1;
  const next = current < 0 ? 0 : (current + step + focusable.length) % focusable.length;
  focusable[next].focus();
}

// Registered on window in the capture phase so it runs before the preview
// vim navigation and the global shortcuts, which then never see the key.
function onKeydown(e: KeyboardEvent) {
  if (!state) return;
  e.stopPropagation();
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      closeLightbox();
      break;
    case "+":
    case "=":
      e.preventDefault();
      zoomAtCenter(state.scale * STEP);
      break;
    case "-":
    case "_":
      e.preventDefault();
      zoomAtCenter(state.scale / STEP);
      break;
    case "0":
      e.preventDefault();
      fit();
      break;
    case "ArrowLeft":
      e.preventDefault();
      cycle(-1);
      break;
    case "ArrowRight":
      e.preventDefault();
      cycle(1);
      break;
    case "Tab":
      trapFocus(e);
      break;
  }
}

function flashLabel(btn: HTMLButtonElement, text: string) {
  const label = btn.querySelector<HTMLElement>(".lightbox-btn-label");
  if (!label) return;
  const original = label.dataset.original ?? label.textContent ?? "";
  label.dataset.original = original;
  label.textContent = text;
  setTimeout(() => {
    label.textContent = original;
  }, 1200);
}

function downloadName(caption: string): string {
  const base = caption
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "diagram"}.svg`;
}

async function downloadSvg(svg: SVGElement, caption: string): Promise<boolean> {
  const text = new XMLSerializer().serializeToString(svg);
  const name = downloadName(caption);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const target = await save({
      defaultPath: name,
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (!target) return false;
    await API.writeFile(target, text);
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function runAction(action: string, btn: HTMLButtonElement) {
  if (!state) return;
  const image = currentImage();
  try {
    switch (action) {
      case "zoom-in":
        zoomAtCenter(state.scale * STEP);
        break;
      case "zoom-out":
        zoomAtCenter(state.scale / STEP);
        break;
      case "fit":
        fit();
        break;
      case "close":
        closeLightbox();
        break;
      case "copy-path":
        if (image) {
          await navigator.clipboard.writeText(image.path ?? image.src);
          flashLabel(btn, "Copied");
        }
        break;
      case "reveal":
        if (image?.path) await API.revealInFinder(image.path);
        break;
      case "download":
        if (state.options.kind === "svg") {
          const saved = await downloadSvg(state.options.svg, state.options.caption);
          if (saved) flashLabel(btn, "Saved");
        }
        break;
    }
  } catch (error) {
    console.error(`Lightbox action ${action} failed:`, error);
    flashLabel(btn, "Failed");
  }
}
