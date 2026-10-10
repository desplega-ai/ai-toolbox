import type { AppConfig, LayoutConfig } from "./config";
import { icons } from "./icons";

export type RailSide = "left" | "right";

export const RAIL_LIMITS: Record<RailSide, { min: number; max: number; fallback: number }> = {
  left: { min: 180, max: 440, fallback: 240 },
  right: { min: 260, max: 560, fallback: 340 },
};

const KEYBOARD_STEP = 16;
const LEFT_BREAKPOINT = 1000;
const BOTH_BREAKPOINT = 760;

export function clampRailWidth(side: RailSide, width: number): number {
  const { min, max, fallback } = RAIL_LIMITS[side];
  if (!Number.isFinite(width)) return fallback;
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** Rails the window is too narrow to show. Never persisted. */
export function autoCollapsedRails(windowWidth: number): Record<RailSide, boolean> {
  return {
    left: windowWidth < LEFT_BREAKPOINT,
    right: windowWidth < BOTH_BREAKPOINT,
  };
}

interface LayoutDeps {
  getConfig: () => AppConfig;
  saveConfig: () => void;
}

let deps: LayoutDeps | null = null;
let auto: Record<RailSide, boolean> = { left: false, right: false };
// A user toggle while a rail is auto-collapsed only lasts until the next
// breakpoint change, so the saved state comes back when the window widens.
const override: Record<RailSide, boolean | null> = { left: null, right: null };
let leftAvailable = false;
let keyboardSaveTimer: number | undefined;

const railEl = (side: RailSide) =>
  document.getElementById(side === "left" ? "left-rail" : "sidebar");
const resizerEl = (side: RailSide) => document.getElementById(`${side}-rail-resizer`);

function layout(): LayoutConfig {
  return deps!.getConfig().layout;
}

function widthOf(side: RailSide): number {
  return clampRailWidth(side, side === "left" ? layout().left_width : layout().right_width);
}

export function isRailOpen(side: RailSide): boolean {
  if (override[side] !== null) return override[side]!;
  const saved = side === "left" ? layout().left_open : layout().right_open;
  return saved && !auto[side];
}

export function initLayout(layoutDeps: LayoutDeps) {
  deps = layoutDeps;
  auto = autoCollapsedRails(window.innerWidth);

  for (const side of ["left", "right"] as RailSide[]) wireResizer(side);

  document.querySelectorAll<HTMLButtonElement>("[data-rail-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => toggleRail(btn.dataset.railToggle as RailSide));
  });

  // Tab strip: each tab shows the panel named by its aria-controls.
  document.querySelectorAll<HTMLButtonElement>(".rail-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      tab.parentElement?.querySelectorAll<HTMLButtonElement>(".rail-tab").forEach((other) => {
        const selected = other === tab;
        other.setAttribute("aria-selected", String(selected));
        const panel = document.getElementById(other.getAttribute("aria-controls") ?? "");
        if (panel) panel.hidden = !selected;
      });
    });
  });

  document.getElementById("reading-width-btn")?.addEventListener("click", toggleReadingWidth);

  window.addEventListener("resize", () => {
    const next = autoCollapsedRails(window.innerWidth);
    if (next.left === auto.left && next.right === auto.right) return;
    auto = next;
    override.left = null;
    override.right = null;
    applyLayout();
  });

  applyLayout();
}

/** Sync rails, separators and the reading-width toggle with config + window size. */
export function applyLayout() {
  if (!deps) return;
  for (const side of ["left", "right"] as RailSide[]) {
    const rail = railEl(side);
    const resizer = resizerEl(side);
    if (!rail || !resizer) continue;
    const available = side === "right" || leftAvailable;
    const open = isRailOpen(side);
    rail.hidden = !available;
    rail.classList.toggle("collapsed", !open);
    rail.style.width = open ? `${widthOf(side)}px` : "";
    resizer.hidden = !available || !open;
    const { min, max } = RAIL_LIMITS[side];
    resizer.setAttribute("aria-valuemin", String(min));
    resizer.setAttribute("aria-valuemax", String(max));
    resizer.setAttribute("aria-valuenow", String(widthOf(side)));
  }

  const narrow = layout().reading_width !== "full";
  document.getElementById("preview-wrapper")?.classList.toggle("reading-narrow", narrow);
  const btn = document.getElementById("reading-width-btn");
  if (btn) {
    btn.setAttribute("aria-pressed", String(narrow));
    btn.title = narrow ? "Full width (⌘⇧E)" : "Reading width (⌘⇧E)";
    const icon = btn.querySelector(".icon");
    if (icon) icon.innerHTML = narrow ? icons["unfold-horizontal"] : icons["fold-horizontal"];
  }
}

/** The outline rail only exists for markdown files. */
export function setLeftRailAvailable(available: boolean) {
  if (leftAvailable === available) return;
  leftAvailable = available;
  applyLayout();
}

export function setRailOpen(side: RailSide, open: boolean) {
  if (!deps) return;
  if (side === "left" && !leftAvailable) return;
  if (auto[side]) {
    override[side] = open;
  } else {
    override[side] = null;
    if (side === "left") layout().left_open = open;
    else layout().right_open = open;
    deps.saveConfig();
  }
  applyLayout();
}

export function toggleRail(side: RailSide) {
  if (!deps) return;
  setRailOpen(side, !isRailOpen(side));
}

export function toggleReadingWidth() {
  if (!deps) return;
  layout().reading_width = layout().reading_width === "full" ? "narrow" : "full";
  deps.saveConfig();
  applyLayout();
}

function setRailWidth(side: RailSide, width: number) {
  const next = clampRailWidth(side, width);
  if (side === "left") layout().left_width = next;
  else layout().right_width = next;
  const rail = railEl(side);
  if (rail) rail.style.width = `${next}px`;
  resizerEl(side)?.setAttribute("aria-valuenow", String(next));
}

function wireResizer(side: RailSide) {
  const resizer = resizerEl(side);
  if (!resizer) return;
  // Dragging toward the center grows the left rail and shrinks the right one.
  const sign = side === "left" ? 1 : -1;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = widthOf(side);
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add("dragging");
    document.body.classList.add("rail-resizing");
  });

  resizer.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    setRailWidth(side, startWidth + sign * (e.clientX - startX));
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.classList.remove("rail-resizing");
    if (widthOf(side) !== startWidth) deps?.saveConfig();
  };
  resizer.addEventListener("pointerup", endDrag);
  resizer.addEventListener("pointercancel", endDrag);
  resizer.addEventListener("lostpointercapture", endDrag);

  resizer.addEventListener("dblclick", () => setRailOpen(side, false));

  resizer.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const direction = e.key === "ArrowRight" ? 1 : -1;
    setRailWidth(side, widthOf(side) + sign * direction * KEYBOARD_STEP);
    window.clearTimeout(keyboardSaveTimer);
    keyboardSaveTimer = window.setTimeout(() => deps?.saveConfig(), 400);
  });
}
