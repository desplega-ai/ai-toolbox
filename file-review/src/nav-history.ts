// Back / forward through link jumps, like a browser: following an in-page
// anchor, opening a linked document, or jumping from the outline records
// where you were. Back returns to that file and scroll position.

export interface NavLocation {
  path: string;
  scrollTop: number;
}

interface NavDeps {
  /** Where the user is now, or null when no file is open. */
  current: () => NavLocation | null;
  /** Show `location`: activate (or reopen) its tab and restore the scroll. */
  restore: (location: NavLocation) => Promise<void>;
  onChange: (canGoBack: boolean, canGoForward: boolean) => void;
}

const MAX_ENTRIES = 50;

let deps: NavDeps | null = null;
let back: NavLocation[] = [];
let forward: NavLocation[] = [];

function same(a: NavLocation | undefined, b: NavLocation): boolean {
  return !!a && a.path === b.path && Math.abs(a.scrollTop - b.scrollTop) < 4;
}

function notify() {
  deps?.onChange(back.length > 0, forward.length > 0);
}

export function initNavHistory(navDeps: NavDeps) {
  deps = navDeps;
  notify();
}

/** Call right before a jump: remembers the current place and clears forward. */
export function recordNavigation() {
  const here = deps?.current();
  if (!here) return;
  if (!same(back[back.length - 1], here)) {
    back.push(here);
    if (back.length > MAX_ENTRIES) back.shift();
  }
  forward = [];
  notify();
}

async function step(from: NavLocation[], to: NavLocation[]) {
  if (!deps) return;
  const target = from.pop();
  if (!target) return;
  const here = deps.current();
  if (here) to.push(here);
  notify();
  await deps.restore(target);
}

export function goBack(): Promise<void> {
  return step(back, forward);
}

export function goForward(): Promise<void> {
  return step(forward, back);
}

/** Drop entries for a file that can no longer be shown (e.g. failed to reopen). */
export function forgetPath(path: string) {
  back = back.filter((l) => l.path !== path);
  forward = forward.filter((l) => l.path !== path);
  notify();
}
