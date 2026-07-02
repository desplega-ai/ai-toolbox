// ctx-viz SPA — vanilla ES module, zero dependencies, no build step.
// Security: transcript content is untrusted — ALL dynamic content is rendered
// via textContent / createElement. innerHTML is never used with data.

const $ = (id) => document.getElementById(id);

const els = {
  filter: $("filter"),
  dirFilter: $("dir-filter"),
  dirDropdown: $("dir-dropdown"),
  dirPills: $("dir-pills"),
  list: $("session-list"),
  footer: $("list-footer"),
  emptyState: $("empty-state"),
  detail: $("detail"),
  loading: $("detail-loading"),
  chipsStatic: $("chips-static"),
  chipsLive: $("chips-live"),
  banner: $("tree-banner"),
  tree: $("tree"),
  treeCounts: $("tree-counts"),
  treeModeBtn: $("tree-mode-btn"),
  treeCompactBtn: $("tree-compact-btn"),
  themeToggle: $("theme-toggle"),
  readout: $("readout"),
  spark: $("spark"),
  sparkPeak: $("spark-peak"),
  btnRestart: $("btn-restart"),
  btnBack: $("btn-back"),
  btnPlay: $("btn-play"),
  btnFwd: $("btn-fwd"),
  speed: $("speed"),
  range: $("scrubber"),
  counter: $("counter"),
  pill: $("replay-pill"),
  toasts: $("toasts"),
};

const SVG_NS = "http://www.w3.org/2000/svg";
const BASE_INTERVAL_MS = 125; // 1x == 8 events/sec
const DOT_ORDER = ["read", "grep", "glob", "edit", "write"];
const AGG_PRIORITY = ["write", "edit", "read", "grep", "glob"];
const KIND_COLOR = {
  read: "var(--cyan)",
  grep: "var(--violet)",
  glob: "var(--amber)",
  edit: "var(--orange)",
  write: "var(--green)",
};
const OUTSIDE_LABEL = "⋯ outside cwd";
const THEME_KEY = "ctxviz-theme";
const TREE_MODE_KEY = "ctxviz-tree-mode";
const TREE_PATHS_KEY = "ctxviz-tree-paths"; // "compact" (default) | "all"
const CHAIN_MIN = 3; // compress runs of >= 3 single-child dir segments

// localStorage may be unavailable (private mode, file://) — never let it throw.
function storedGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storedSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort persistence only
  }
}

const S = {
  // list
  sessions: [],
  total: 0,
  filter: "",
  dirSelected: [], // selected directory pills (session-only, no persistence)
  dirOpts: [], // current dropdown entries [{dir, count}]
  dirActive: 0, // keyboard-highlighted dropdown index
  selectedPath: null,
  loadSeq: 0,
  // current session
  meta: null,
  events: [],
  tree: null,
  model: null, // { root, byPath, fileSet, allNodes, rendered, touchedFiles, totalFiles }
  treeMode: storedGet(TREE_MODE_KEY) === "full" ? "full" : "touched",
  compactPaths: storedGet(TREE_PATHS_KEY) !== "all", // default ON
  metrics: null,
  liveChips: null,
  // playback
  playhead: 0,
  playing: false,
  speed: 1,
  timer: null,
  // sparkline
  sparkLine: null,
};

/* ------------------------------ formatting ------------------------------ */

function fmtInt(n) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
}

function fmtK(n) {
  n = Number.isFinite(n) ? n : 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
}

function fmtTok(n) {
  return "~" + fmtK(n || 0) + " tok";
}

function fmtElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function humanSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function shortModel(m) {
  return String(m || "").replace(/^claude-/, "");
}

function midEllipsis(s, max = 44) {
  s = String(s || "");
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return s.slice(0, half) + "…" + s.slice(s.length - half);
}

function trunc(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function basename(p) {
  const parts = String(p || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/* -------------------------------- toasts -------------------------------- */

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  els.toasts.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 350);
  }, 6000);
}

/* --------------------------------- fetch -------------------------------- */

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body
  }
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

/* ----------------------------- session list ----------------------------- */

function renderSkeletons() {
  els.list.textContent = "";
  for (let i = 0; i < 8; i++) {
    const card = document.createElement("div");
    card.className = "card skeleton";
    for (const w of ["w85", "w40", "w60"]) {
      const bar = document.createElement("div");
      bar.className = "sk-bar " + w;
      card.appendChild(bar);
    }
    els.list.appendChild(card);
  }
  els.footer.textContent = "";
}

function sessionDir(s) {
  return s.cwd || s.project || "";
}

function renderList() {
  els.list.textContent = "";
  const q = S.filter.trim().toLowerCase();
  const matched = S.sessions.filter((s) => {
    const textOk =
      !q ||
      String(s.title || "").toLowerCase().includes(q) ||
      String(s.cwd || "").toLowerCase().includes(q);
    const dirOk = !S.dirSelected.length || S.dirSelected.includes(sessionDir(s));
    return textOk && dirOk;
  });

  if (!S.sessions.length) {
    const msg = document.createElement("div");
    msg.className = "list-msg";
    msg.textContent = "no sessions found";
    els.list.appendChild(msg);
  } else if (!matched.length) {
    const msg = document.createElement("div");
    msg.className = "list-msg";
    msg.textContent = "no sessions match the filter";
    els.list.appendChild(msg);
  } else {
    const frag = document.createDocumentFragment();
    for (const s of matched) frag.appendChild(sessionCard(s));
    els.list.appendChild(frag);
  }

  if (q || S.dirSelected.length) {
    els.footer.textContent = `${fmtInt(matched.length)} of ${fmtInt(S.sessions.length)} match`;
  } else {
    els.footer.textContent = `showing ${fmtInt(S.sessions.length)} of ${fmtInt(S.total)} sessions`;
  }
}

function sessionCard(s) {
  const card = document.createElement("div");
  card.className = "card" + (s.path === S.selectedPath ? " selected" : "");
  card.dataset.path = s.path || "";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = s.title || (s.id ? s.id.slice(0, 8) : "untitled");
  title.title = s.title || "";

  const dir = document.createElement("div");
  dir.className = "card-dir";
  dir.textContent = basename(s.cwd) || s.project || "";
  if (s.cwd) dir.title = s.cwd;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent = [relTime(s.modifiedAt), humanSize(s.sizeBytes), s.gitBranch]
    .filter(Boolean)
    .join(" · ");

  const stats = document.createElement("div");
  stats.className = "card-stats";
  const statsTxt = s.stats && typeof s.stats === "object" ? cardStatsText(s.stats) : "";
  if (statsTxt) {
    stats.textContent = statsTxt;
  } else {
    stats.hidden = true; // patched in place by the stats poller when ready
  }

  card.append(title, dir, meta, stats);
  card.addEventListener("click", () => selectSession(s));
  return card;
}

/* ---------------------------- session stats ------------------------------ */

const statsPoll = { timer: null, startedAt: 0, inFlight: false };

// Stats shape: {filesRead, linesRead, ctxTokens, filesReadInTree, treeFiles}
// — every field may be null/missing (older backend shapes included). Render
// only the segments whose inputs are present.
function cardStatsText(st) {
  const parts = [];
  if (Number.isFinite(st?.filesRead)) parts.push(`${fmtInt(st.filesRead)} files`);
  if (Number.isFinite(st?.linesRead)) parts.push(`${fmtK(st.linesRead)} lines`);
  if (Number.isFinite(st?.filesReadInTree) && Number.isFinite(st?.treeFiles) && st.treeFiles > 0) {
    parts.push(((st.filesReadInTree / st.treeFiles) * 100).toFixed(1) + "%");
  }
  if (Number.isFinite(st?.ctxTokens)) parts.push("ctx " + fmtK(st.ctxTokens));
  return parts.join(" · ");
}

function patchCardStats() {
  const byPath = new Map();
  for (const s of S.sessions) {
    if (s.path && s.stats && typeof s.stats === "object") byPath.set(s.path, s.stats);
  }
  for (const el of els.list.querySelectorAll(".card")) {
    const st = byPath.get(el.dataset.path);
    if (!st) continue;
    const statsEl = el.querySelector(".card-stats");
    if (statsEl && statsEl.hidden) {
      const txt = cardStatsText(st);
      if (!txt) continue; // all fields null — nothing to show
      statsEl.textContent = txt;
      statsEl.hidden = false;
    }
  }
}

function stopStatsPoll() {
  if (statsPoll.timer) clearInterval(statsPoll.timer);
  statsPoll.timer = null;
}

// The backend computes stats asynchronously; /api/stats may not even exist
// yet. Poll quietly every 2s and patch cards in place (no list re-render, so
// the filter state stays intact). Stop on: pending === 0, all cards have
// stats, 90s elapsed, or any 404/network error — all silent.
function maybeStartStatsPoll() {
  stopStatsPoll();
  if (!S.sessions.length) return;
  if (S.sessions.every((s) => s.stats)) return;
  statsPoll.startedAt = Date.now();
  statsPoll.timer = setInterval(pollStats, 2000);
}

async function pollStats() {
  if (statsPoll.inFlight) return;
  if (Date.now() - statsPoll.startedAt > 90000) {
    stopStatsPoll();
    return;
  }
  statsPoll.inFlight = true;
  let data;
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) {
      stopStatsPoll();
      return;
    }
    data = await res.json();
  } catch {
    stopStatsPoll();
    return;
  } finally {
    statsPoll.inFlight = false;
  }

  const ready = data?.ready;
  if (ready && typeof ready === "object") {
    let changed = false;
    for (const s of S.sessions) {
      if (!s.stats && s.path && ready[s.path] && typeof ready[s.path] === "object") {
        s.stats = ready[s.path];
        changed = true;
      }
    }
    if (changed) patchCardStats();
  }
  if (data?.pending === 0 || S.sessions.every((s) => s.stats)) stopStatsPoll();
}

/* --------------------------- directory filter ---------------------------- */

// fzf-style case-insensitive subsequence match. Returns a score (higher is
// better) or -1 when the query is not a subsequence of the target.
function fuzzyScore(query, target) {
  const q = String(query).toLowerCase();
  const t = String(target).toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return -1;
    score += idx === prev + 1 ? 3 : 1; // consecutive runs score higher
    prev = idx;
    ti = idx + 1;
  }
  if (t.includes(q)) score += 2; // contiguous substring bonus
  if (basename(t).includes(q)) score += 4; // basename match bonus
  return score;
}

// distinct dirs across the loaded session list, with session counts
function dirChoiceCounts() {
  const counts = new Map();
  for (const s of S.sessions) {
    const d = sessionDir(s);
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  return counts;
}

function closeDirDropdown() {
  els.dirDropdown.hidden = true;
}

function setDirActive(i) {
  const n = S.dirOpts.length;
  if (!n) return;
  S.dirActive = ((i % n) + n) % n; // wrap around
  const rows = els.dirDropdown.querySelectorAll(".dir-opt");
  rows.forEach((el, idx) => el.classList.toggle("active", idx === S.dirActive));
  rows[S.dirActive]?.scrollIntoView({ block: "nearest" });
}

function updateDirDropdown() {
  const q = els.dirFilter.value.trim();
  const dd = els.dirDropdown;
  dd.textContent = "";
  S.dirOpts = [];
  S.dirActive = 0;
  if (!q) {
    dd.hidden = true;
    return;
  }

  const scored = [];
  for (const [dir, count] of dirChoiceCounts()) {
    if (S.dirSelected.includes(dir)) continue;
    const sc = fuzzyScore(q, dir);
    if (sc >= 0) scored.push({ dir, count, sc });
  }
  scored.sort((a, b) => b.sc - a.sc || b.count - a.count || a.dir.localeCompare(b.dir));
  S.dirOpts = scored.slice(0, 8);

  if (!S.dirOpts.length) {
    const msg = document.createElement("div");
    msg.className = "dir-none";
    msg.textContent = "no matching directories";
    dd.appendChild(msg);
    dd.hidden = false;
    return;
  }

  S.dirOpts.forEach((opt, idx) => {
    const row = document.createElement("div");
    row.className = "dir-opt" + (idx === S.dirActive ? " active" : "");

    const top = document.createElement("div");
    top.className = "dir-opt-top";
    const name = document.createElement("span");
    name.className = "dir-opt-name";
    name.textContent = basename(opt.dir) || opt.dir;
    const count = document.createElement("span");
    count.className = "dir-opt-count";
    count.textContent = fmtInt(opt.count);
    top.append(name, count);

    const path = document.createElement("div");
    path.className = "dir-opt-path";
    path.textContent = opt.dir;

    row.append(top, path);
    row.addEventListener("mouseenter", () => setDirActive(idx));
    row.addEventListener("click", () => selectDir(opt.dir));
    dd.appendChild(row);
  });
  dd.hidden = false;
}

function selectDir(dir) {
  if (!dir || S.dirSelected.includes(dir)) return;
  S.dirSelected.push(dir);
  els.dirFilter.value = "";
  closeDirDropdown();
  renderDirPills();
  renderList();
  els.dirFilter.focus();
}

function removeDir(dir) {
  S.dirSelected = S.dirSelected.filter((d) => d !== dir);
  renderDirPills();
  renderList();
}

function renderDirPills() {
  els.dirPills.textContent = "";
  els.dirPills.hidden = S.dirSelected.length === 0;
  for (const dir of S.dirSelected) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.title = dir;

    const name = document.createElement("span");
    name.className = "pill-name";
    name.textContent = basename(dir) || dir;

    const x = document.createElement("button");
    x.className = "pill-x";
    x.type = "button";
    x.textContent = "×";
    x.title = "remove " + dir;
    x.addEventListener("click", () => removeDir(dir));

    pill.append(name, x);
    els.dirPills.appendChild(pill);
  }
}

els.dirFilter.addEventListener("input", updateDirDropdown);
els.dirFilter.addEventListener("focus", updateDirDropdown);

els.dirFilter.addEventListener("keydown", (e) => {
  const open = !els.dirDropdown.hidden && S.dirOpts.length > 0;
  switch (e.key) {
    case "ArrowDown":
      if (open) {
        e.preventDefault();
        setDirActive(S.dirActive + 1);
      }
      break;
    case "ArrowUp":
      if (open) {
        e.preventDefault();
        setDirActive(S.dirActive - 1);
      }
      break;
    case "Enter":
      if (open) {
        e.preventDefault();
        selectDir(S.dirOpts[S.dirActive]?.dir);
      }
      break;
    case "Escape":
      closeDirDropdown();
      break;
    case "Backspace":
      if (!els.dirFilter.value && S.dirSelected.length) {
        S.dirSelected.pop();
        renderDirPills();
        renderList();
      }
      break;
  }
});

// click outside closes the dropdown
document.addEventListener("click", (e) => {
  if (els.dirDropdown.hidden) return;
  const t = e.target;
  if (!(t instanceof Element) || !t.closest(".dirfilter-wrap")) closeDirDropdown();
});

async function loadSessions() {
  renderSkeletons();
  try {
    const data = await fetchJSON("/api/sessions");
    S.sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    S.total = data?.total ?? S.sessions.length;
  } catch (err) {
    S.sessions = [];
    S.total = 0;
    toast("failed to load sessions: " + err.message);
  }
  renderList();
  maybeStartStatsPoll();
}

/* ----------------------------- session load ----------------------------- */

function selectSession(s) {
  if (!s?.path || s.path === S.selectedPath) return;
  S.selectedPath = s.path;
  for (const el of els.list.querySelectorAll(".card")) {
    el.classList.toggle("selected", el.dataset.path === s.path);
  }
  loadSession(s);
}

function fetchTree(cwd, branch, before) {
  const params = new URLSearchParams();
  params.set("cwd", cwd);
  if (branch) params.set("branch", branch);
  if (before) params.set("before", before);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  return fetchJSON(`/api/tree?${params.toString()}`, { signal: ctrl.signal }).finally(() =>
    clearTimeout(to)
  );
}

async function loadSession(item) {
  const seq = ++S.loadSeq;
  pause();
  els.emptyState.hidden = true;
  els.detail.hidden = true;
  els.loading.hidden = false;

  const sessionP = fetchJSON(`/api/session?path=${encodeURIComponent(item.path)}`);

  // Tree fetch: in parallel using list-item data when available, otherwise
  // chained off the session detail's meta. A failed/timed-out tree fetch
  // must never block the timeline — it resolves to a "missing"-like stub.
  const treeP = (item.cwd
    ? fetchTree(item.cwd, item.gitBranch, item.startedAt)
    : sessionP.then(
        (d) =>
          d?.meta?.cwd
            ? fetchTree(d.meta.cwd, d.meta.gitBranch, d.meta.startedAt)
            : { root: "", source: "missing", files: [], truncated: false },
        // session fetch failed — no tree was attempted; resolve silently
        // (the main catch below owns that error's toast)
        () => ({ root: "", source: "missing", files: [], truncated: false })
      )
  ).catch((err) => {
    if (seq === S.loadSeq) toast("file tree unavailable: " + err.message);
    return { root: item.cwd || "", source: "error", files: [], truncated: false };
  });

  let detail;
  try {
    detail = await sessionP;
  } catch (err) {
    if (seq !== S.loadSeq) return;
    // Reset selection + session state: allows re-clicking the card to retry,
    // and stops keyboard playback from driving the hidden previous session.
    S.selectedPath = null;
    S.meta = null;
    S.events = [];
    for (const el of els.list.querySelectorAll(".card.selected")) el.classList.remove("selected");
    els.loading.hidden = true;
    els.emptyState.hidden = false;
    toast("failed to load session: " + err.message);
    return;
  }

  const tree = await treeP; // never rejects
  if (seq !== S.loadSeq) return;

  setupSession(detail, tree);
}

function setupSession(detail, tree) {
  S.meta = detail?.meta || {};
  S.events = Array.isArray(detail?.events) ? detail.events : [];
  S.tree = tree || { root: "", source: "missing", files: [], truncated: false };
  if (!Array.isArray(S.tree.files)) S.tree.files = [];

  buildStaticChips(S.meta);
  buildLiveChips();
  updateBanner();

  S.model = buildTreeModel(S.tree.files, S.events);
  renderTree();

  buildSpark();

  S.playhead = 0;
  resetPlayState();
  els.range.max = String(S.events.length);
  els.range.value = "0";
  els.range.disabled = S.events.length === 0;
  els.speed.value = String(S.speed);

  updateTransport();

  els.loading.hidden = true;
  els.detail.hidden = false;

  if (S.events.length) play(); // auto-play on load
}

/* --------------------------------- chips -------------------------------- */

function mkChip(label, live) {
  const chip = document.createElement("div");
  chip.className = "chip" + (live ? " live" : "");
  const l = document.createElement("span");
  l.className = "chip-label";
  l.textContent = label;
  const v = document.createElement("span");
  v.className = "chip-value";
  chip.append(l, v);
  return { chip, v };
}

function buildStaticChips(meta) {
  els.chipsStatic.textContent = "";
  const add = (label, value, title) => {
    const { chip, v } = mkChip(label, false);
    v.textContent = value;
    if (title) chip.title = title;
    els.chipsStatic.appendChild(chip);
  };
  add("started", fmtDateTime(meta.startedAt));
  add("elapsed", fmtElapsed(meta.elapsedMs));
  add("model", (meta.models || []).map(shortModel).join(", ") || "—");
  add("cost", Number.isFinite(meta.costUSD) ? "~$" + meta.costUSD.toFixed(2) : "—");
  add("final ctx", fmtK(meta.finalContextTokens || 0));
  add("cwd", midEllipsis(meta.cwd || "—"), meta.cwd || "");
}

function buildLiveChips() {
  els.chipsLive.textContent = "";
  const files = mkChip("files read", true);
  const lines = mkChip("lines", true);
  const rtok = mkChip("~read tok", true);
  const ctx = mkChip("ctx now", true);
  const fctx = mkChip("file ctx", true);
  fctx.chip.hidden = true; // shown once a context event sets ctxNow > 0
  els.chipsLive.append(files.chip, lines.chip, rtok.chip, ctx.chip, fctx.chip);
  S.liveChips = { files, lines, rtok, ctx, fctx };
}

function updateBanner() {
  const src = S.tree?.source;
  if (src === "missing") {
    els.banner.textContent = "workspace not found — showing touched files only";
    els.banner.hidden = false;
  } else if (src === "error") {
    els.banner.textContent = "file tree unavailable — showing touched files only";
    els.banner.hidden = false;
  } else if (S.tree?.truncated) {
    els.banner.textContent = "file tree truncated at 30,000 files";
    els.banner.hidden = false;
  } else {
    els.banner.hidden = true;
  }
}

function updateLiveChips() {
  if (!S.liveChips) return;
  const M = S.metrics;
  const treeCount = S.tree.files.length;
  const treeUsable = treeCount > 0;
  const filesEl = S.liveChips.files;

  if (treeUsable) {
    const pct = ((M.readIn.size / treeCount) * 100).toFixed(1);
    filesEl.v.textContent = `${fmtInt(M.readIn.size)}/${fmtInt(treeCount)} · ${pct}%`;
    filesEl.chip.title = M.readOut.size
      ? `${fmtInt(M.readIn.size)} distinct in-tree files read (+${M.readOut.size} outside)`
      : `${fmtInt(M.readIn.size)} distinct in-tree files read`;
  } else {
    // tree missing / errored / empty: no denominator, no percentage
    const n = M.readIn.size + M.readOut.size;
    const treeNA = S.tree.source === "missing" || S.tree.source === "error";
    filesEl.v.textContent = `${fmtInt(n)} read${treeNA ? " · tree n/a" : ""}`;
    filesEl.chip.title = `${fmtInt(n)} distinct files read`;
  }

  S.liveChips.lines.v.textContent = fmtInt(M.lines);
  S.liveChips.rtok.v.textContent = fmtK(M.readTokens);
  S.liveChips.ctx.v.textContent = fmtK(M.ctxNow);

  // share of the current context attributable to file exploration
  // (read/grep/glob token estimates vs the latest context size)
  const fctx = S.liveChips.fctx;
  if (M.ctxNow > 0) {
    const pct = Math.max(0, Math.min(100, (M.readTokens / M.ctxNow) * 100));
    fctx.v.textContent = "~" + (pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1)) + "%";
    fctx.chip.title =
      "estimated tokens from file reads/searches as a share of the context " +
      `window at this point (~${fmtK(M.readTokens)} of ${fmtK(M.ctxNow)})`;
    fctx.chip.hidden = false;
  } else {
    fctx.chip.hidden = true;
  }
}

/* ------------------------------- tree model ------------------------------ */

function eventFilePaths(ev) {
  switch (ev?.kind) {
    case "read":
    case "edit":
    case "write":
      return ev.file && ev.file !== "." ? [ev.file] : [];
    case "grep":
    case "glob":
      return Array.isArray(ev.files) ? ev.files.filter((f) => f && f !== ".") : [];
    default:
      return [];
  }
}

function buildTreeModel(treeFiles, events) {
  const fileSet = new Set(treeFiles);
  const allNodes = [];

  function mkNode(name, key, dir, parent) {
    const node = {
      name,
      key,
      dir,
      parent,
      children: dir ? new Map() : null,
      sorted: null,
      depth: parent ? parent.depth + 1 : -1,
      expanded: false,
      // DOM
      row: null,
      wrap: null,
      childBox: null,
      flashTimer: 0,
      rdepth: 0, // render depth (differs from model depth under compressed chains)
      // path compression: head of a compressed run owns the row for the whole
      // chain; hidden segments point back at it
      chain: null, // on the head: [head, ..., tail]
      chainHead: null, // on hidden segments (and tail): the head node
      // touched-only mode: file appears in any event (or is an ancestor dir)
      inTouchedSet: false,
      // cumulative playback state
      kinds: new Set(),
      readCount: 0,
      created: false,
      descTouched: 0,
      descKinds: new Set(),
    };
    allNodes.push(node);
    return node;
  }

  const root = mkNode("", "", true, null);
  root.expanded = true;
  const byPath = new Map();
  let outside = null;

  function addUnder(base, parts, finalKey) {
    let cur = base;
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const name = parts[i];
      let child = cur.children.get(name);
      if (!child) {
        child = mkNode(name, last ? finalKey : "", !last, cur);
        cur.children.set(name, child);
        cur.sorted = null;
      } else if (!last && !child.dir) {
        // defensive: same segment used as both file and dir
        child.dir = true;
        child.children = new Map();
        child.sorted = null;
        cur.sorted = null; // dir/file ordering of the parent changed
      }
      cur = child;
    }
    return cur;
  }

  function ensureOutside() {
    if (!outside) {
      outside = mkNode(OUTSIDE_LABEL, "", true, root);
      root.children.set(OUTSIDE_LABEL, outside);
      root.sorted = null;
    }
    return outside;
  }

  function addPath(p) {
    if (!p || p === ".") return null;
    if (byPath.has(p)) return byPath.get(p);
    let node;
    if (p.startsWith("/")) {
      node = addUnder(ensureOutside(), p.split("/").filter(Boolean), p);
    } else {
      node = addUnder(root, p.split("/").filter(Boolean), p);
    }
    byPath.set(p, node);
    return node;
  }

  // union: workspace tree files + every file appearing in events
  for (const f of treeFiles) {
    if (typeof f === "string") addPath(f);
  }
  for (const ev of events) {
    for (const p of eventFilePaths(ev)) addPath(p);
  }

  // touched set: every event file + its ancestor dirs (drives touched-only mode)
  for (const ev of events) {
    for (const p of eventFilePaths(ev)) {
      const node = byPath.get(p);
      if (!node || node.inTouchedSet) continue;
      node.inTouchedSet = true;
      for (let a = node.parent; a && !a.inTouchedSet; a = a.parent) a.inTouchedSet = true;
    }
  }
  root.inTouchedSet = true;

  let touchedFiles = 0;
  let totalFiles = 0;
  for (const n of allNodes) {
    if (n.dir) continue;
    totalFiles++;
    if (n.inTouchedSet) touchedFiles++;
  }

  return { root, byPath, fileSet, allNodes, rendered: new Set(), touchedFiles, totalFiles };
}

function sortedChildren(node) {
  if (!node.sorted) {
    node.sorted = [...node.children.values()].sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  return node.sorted;
}

/* ---------------------------- tree rendering ----------------------------- */

// Touched-only visibility is driven by the playhead: a node is visible once
// its first event has played (files: kinds/created; dirs: any touched
// descendant, or touched directly e.g. by a grep match on the dir).
function isVisibleTouched(node) {
  return node.kinds.size > 0 || node.created || node.descTouched > 0;
}

// Children visible in the current mode: touched-only filters to nodes already
// touched at the playhead; full mode shows everything.
function visibleChildren(node) {
  const kids = sortedChildren(node);
  return S.treeMode === "touched" ? kids.filter(isVisibleTouched) : kids;
}

// Path compression: starting at `head`, collect the run of dirs where each
// has exactly one visible child that is itself a dir. The run ends at the
// first dir whose visible children are not a single dir (the tail). Runs of
// >= CHAIN_MIN dirs render as one `first / … / last` row.
function chainOf(head) {
  const chain = [head];
  let cur = head;
  for (;;) {
    const kids = visibleChildren(cur);
    if (kids.length === 1 && kids[0].dir) {
      chain.push(kids[0]);
      cur = kids[0];
    } else {
      break;
    }
  }
  return chain.length >= CHAIN_MIN ? chain : null;
}

// The row element representing a node (its own, or its chain head's).
function rowEl(node) {
  const owner = node.chainHead || node;
  return owner.row;
}

// Full path of a node for title attributes (absolute for outside-cwd nodes,
// cwd-relative otherwise).
function nodePath(node) {
  const parts = [];
  let outside = false;
  for (let n = node; n && n !== S.model.root; n = n.parent) {
    if (n.parent === S.model.root && n.name === OUTSIDE_LABEL) {
      outside = true;
      break;
    }
    parts.unshift(n.name);
  }
  return (outside ? "/" : "") + parts.join("/");
}

// Full re-render for the current mode (session setup, mode switch, backward
// scrub in touched mode): reset all DOM refs, apply the mode's expansion
// (touched-only: every visible dir expanded — the visible set is small;
// full: only root expanded, lazy children), then rebuild.
function renderTree() {
  const touchedMode = S.treeMode === "touched";
  for (const n of S.model.allNodes) {
    n.row = null;
    n.rowParts = null;
    n.wrap = null;
    n.childBox = null;
    n.chain = null;
    n.chainHead = null;
    n.expanded = touchedMode && n.dir && isVisibleTouched(n);
  }
  S.model.root.expanded = true;
  renderTreeRoot();
  updateTreeToolbar();
}

function updateTreeCounts() {
  if (!S.model) {
    els.treeCounts.textContent = "";
    return;
  }
  const now = S.metrics ? S.metrics.touchedNow : 0;
  els.treeCounts.textContent =
    `${fmtInt(now)} / ${fmtInt(S.model.touchedFiles)} touched · ` +
    `${fmtInt(S.model.totalFiles)} total`;
}

function updateTreeToolbar() {
  updateTreeCounts();
  els.treeModeBtn.textContent = S.treeMode === "touched" ? "touched only" : "full tree";
  els.treeModeBtn.title =
    S.treeMode === "touched" ? "show the full workspace tree" : "show only touched files";
  els.treeCompactBtn.textContent = S.compactPaths ? "compact paths" : "all edges";
  els.treeCompactBtn.title = S.compactPaths
    ? "render every directory as its own row"
    : "collapse single-child directory runs into one row";
}

function renderTreeRoot() {
  els.tree.textContent = "";
  const model = S.model;
  model.rendered.clear();
  model.root.childBox = els.tree; // root children live directly in the container
  model.root.wrap = els.tree;
  model.root.expanded = true;

  const kids = visibleChildren(model.root);
  if (kids.length === 0) {
    const msg = document.createElement("div");
    msg.className = "tree-empty";
    msg.textContent =
      S.treeMode === "touched" && model.root.children.size > 0
        ? "no files touched yet — tree grows during replay"
        : "no files in workspace or events";
    els.tree.appendChild(msg);
    return;
  }
  const frag = document.createDocumentFragment();
  renderChildrenInto(model.root, frag, 0);
  els.tree.appendChild(frag);
}

function clearTreeEmptyMsg() {
  const msg = els.tree.querySelector(":scope > .tree-empty");
  if (msg) msg.remove();
}

// Touched-only forward play: incrementally insert a newly-touched node (and
// any not-yet-rendered ancestors) into the DOM at its sorted position —
// no full rebuild per tick.
function ensureNodeDom(node) {
  if (!node || node === S.model.root || node.row) return;
  if (node.dir) node.expanded = true; // newly appearing dirs come in expanded
  ensureNodeDom(node.parent);
  if (node.row) return; // rendered by the parent's eager expansion

  const parent = node.parent;
  let container;
  if (parent === S.model.root) {
    container = els.tree;
  } else {
    if (!parent.childBox) {
      parent.childBox = document.createElement("div");
      parent.childBox.className = "children";
      parent.wrap.appendChild(parent.childBox);
    }
    parent.expanded = true;
    parent.childBox.hidden = false;
    updateNodeRow(parent);
    container = parent.childBox;
  }

  clearTreeEmptyMsg();
  const el = renderNode(node, parent === S.model.root ? 0 : (parent.rdepth || 0) + 1);
  // insert before the next already-rendered visible sibling (sorted order)
  const sibs = visibleChildren(parent);
  let before = null;
  for (let i = sibs.indexOf(node) + 1; i < sibs.length; i++) {
    const sEl = sibs[i].dir ? sibs[i].wrap : sibs[i].row;
    if (sEl && sEl.parentNode === container) {
      before = sEl;
      break;
    }
  }
  container.insertBefore(el, before);
}

function renderChildrenInto(node, container, depth) {
  for (const child of visibleChildren(node)) container.appendChild(renderNode(child, depth));
}

// Renders a node lazily: dirs get a wrapper; children are only rendered when
// the dir is first expanded (collapsed subtrees have no DOM at all).
// With compact paths ON, a dir starting a single-child run of >= CHAIN_MIN
// dirs renders as ONE `first / … / last` row whose children are the tail's
// children, indented a single level.
function renderNode(node, depth) {
  depth = Number.isFinite(depth) ? depth : Math.max(0, node.depth);
  node.rdepth = depth;

  let chain = null;
  if (node.dir && S.compactPaths) {
    chain = chainOf(node);
    if (chain) {
      node.chain = chain;
      for (let i = 1; i < chain.length; i++) chain[i].chainHead = node;
    }
  }
  const tail = chain ? chain[chain.length - 1] : node;

  const row = document.createElement("div");
  row.className = "node" + (node.dir ? " dir" : "");
  row.style.paddingLeft = 10 + depth * 14 + "px";

  const chev = document.createElement("span");
  chev.className = "chevron";
  chev.textContent = node.dir ? "▸" : "";

  const dots = document.createElement("span");
  dots.className = "dots";

  const name = document.createElement("span");
  name.className = "node-name";
  if (chain) {
    const first = document.createElement("span");
    first.textContent = node.name;
    const mid = document.createElement("span");
    mid.className = "chain-ellipsis";
    mid.textContent = " / … / ";
    const last = document.createElement("span");
    last.textContent = tail.name;
    name.append(first, mid, last);
    name.title = nodePath(tail);
  } else {
    name.textContent = node.name;
    if (node.key) name.title = node.key;
  }

  const badge = document.createElement("span");
  badge.className = "badge-new";
  badge.textContent = "+";
  badge.hidden = true;

  const agg = document.createElement("span");
  agg.className = "agg";
  agg.hidden = true;

  row.append(chev, dots, name, badge, agg);
  node.row = row;
  node.rowParts = { chev, dots, name, badge, agg };
  S.model.rendered.add(node);

  if (node.dir) {
    const wrap = document.createElement("div");
    wrap.appendChild(row);
    node.wrap = wrap;
    row.addEventListener("click", () => {
      if (node.expanded) collapseDir(node);
      else expandDir(node);
    });
    if (node.expanded) {
      // pre-expanded (touched-only mode): render children eagerly
      node.childBox = document.createElement("div");
      node.childBox.className = "children";
      renderChildrenInto(tail, node.childBox, depth + 1);
      wrap.appendChild(node.childBox);
    }
    updateNodeRow(node);
    return wrap;
  }

  updateNodeRow(node);
  return row;
}

function expandDir(node) {
  if (node.chainHead) node = node.chainHead; // hidden segments expand their row
  if (!node.dir || node.expanded) return;
  node.expanded = true;
  if (!node.childBox) {
    node.childBox = document.createElement("div");
    node.childBox.className = "children";
    const src = node.chain ? node.chain[node.chain.length - 1] : node;
    renderChildrenInto(src, node.childBox, (node.rdepth || 0) + 1);
    node.wrap.appendChild(node.childBox);
  } else {
    node.childBox.hidden = false;
  }
  updateNodeRow(node);
}

function collapseDir(node) {
  if (node.chainHead) node = node.chainHead;
  if (!node.dir || !node.expanded || node === S.model.root) return;
  node.expanded = false;
  if (node.childBox) node.childBox.hidden = true;
  updateNodeRow(node);
}

function aggKind(kinds) {
  for (const k of AGG_PRIORITY) if (kinds.has(k)) return k;
  return "read";
}

function updateNodeRow(node) {
  if (node.chainHead) node = node.chainHead; // hidden segments paint their row
  if (!node.row) return;
  const p = node.rowParts;

  if (node.dir) p.chev.textContent = node.expanded ? "▾" : "▸";

  // effective mark state: compressed rows aggregate their merged segments
  let kinds = node.kinds;
  let readCount = node.readCount;
  let created = node.created;
  if (node.chain) {
    kinds = new Set();
    readCount = 0;
    created = false;
    for (const s of node.chain) {
      for (const k of s.kinds) kinds.add(k);
      readCount += s.readCount;
      created = created || s.created;
    }
  }

  // per-kind dots
  p.dots.textContent = "";
  for (const k of DOT_ORDER) {
    if (!kinds.has(k)) continue;
    const d = document.createElement("span");
    d.className = "dot k-" + k;
    if (k === "read" && readCount > 0) {
      d.style.opacity = String(Math.min(1, 0.45 + readCount * 0.14));
    }
    p.dots.appendChild(d);
  }

  // read heat ramp on the row background
  const heat = readCount > 0 ? Math.min(0.14, readCount * 0.03) : 0;
  if (heat > 0) node.row.style.setProperty("--heat", heat.toFixed(3));
  else node.row.style.removeProperty("--heat");

  p.badge.hidden = !created;
  node.row.classList.toggle("touched", kinds.size > 0 || created);

  // collapsed dirs: aggregate dot + touched-descendant count (a chain head's
  // descTouched already covers everything under the whole compressed run)
  if (node.dir) {
    if (!node.expanded && node.descTouched > 0) {
      p.agg.textContent = "";
      const d = document.createElement("span");
      d.className = "dot k-" + aggKind(node.descKinds);
      const c = document.createElement("span");
      c.className = "agg-count";
      c.textContent = fmtInt(node.descTouched);
      p.agg.append(d, c);
      p.agg.hidden = false;
    } else {
      p.agg.hidden = true;
    }
  }
}

function updateAllRenderedRows() {
  for (const node of S.model.rendered) updateNodeRow(node);
}

function expandAncestors(node) {
  const chain = [];
  for (let a = node.parent; a && a !== S.model.root; a = a.parent) chain.push(a);
  for (let i = chain.length - 1; i >= 0; i--) expandDir(chain[i]);
}

function flashNode(node, kind) {
  const owner = node.chainHead || node; // hidden chain segments flash their row
  if (!owner.row) return;
  owner.row.style.setProperty("--flash", KIND_COLOR[kind] || "var(--cyan)");
  owner.row.classList.remove("flash");
  void owner.row.offsetWidth; // restart the animation
  owner.row.classList.add("flash");
  clearTimeout(owner.flashTimer);
  owner.flashTimer = setTimeout(() => {
    if (owner.row) owner.row.classList.remove("flash");
  }, 460);
}

// Auto-expand ancestors, refresh marks, flash, and scroll to the first node.
function highlightNodes(nodes, kind) {
  if (!nodes.length) return;
  for (const node of nodes) {
    expandAncestors(node);
    updateNodeRow(node);
    for (let a = node.parent; a; a = a.parent) updateNodeRow(a);
    flashNode(node, kind);
  }
  rowEl(nodes[0])?.scrollIntoView({ block: "nearest" });
}

/* --------------------------- playback state ------------------------------ */

function resetPlayState() {
  S.metrics = {
    readIn: new Set(),
    readOut: new Set(),
    lines: 0,
    readTokens: 0,
    ctxNow: 0,
    touchedNow: 0, // distinct files touched so far (drives the tree toolbar)
  };
  for (const n of S.model.allNodes) {
    n.kinds.clear();
    n.readCount = 0;
    n.created = false;
    n.descTouched = 0;
    n.descKinds.clear();
  }
}

function touchFile(path, kind) {
  const node = S.model.byPath.get(path);
  if (!node) return null;
  const wasTouched = node.kinds.size > 0 || node.created;
  node.kinds.add(kind);
  if (kind === "read") node.readCount++;
  if (kind === "write" && !S.model.fileSet.has(path)) node.created = true;
  if (!wasTouched && !node.dir) S.metrics.touchedNow++;
  for (let a = node.parent; a; a = a.parent) {
    if (!wasTouched) a.descTouched++;
    a.descKinds.add(kind);
  }
  return node;
}

// Applies one event to cumulative state; returns the touched tree nodes.
function applyEventState(ev) {
  const touched = [];
  switch (ev?.kind) {
    case "context":
      S.metrics.ctxNow = ev.contextTokens || 0;
      break;
    case "read": {
      S.metrics.lines += ev.lines || 0;
      S.metrics.readTokens += ev.tokens || 0;
      const f = ev.file;
      if (f && f !== ".") {
        if (S.model.fileSet.has(f)) S.metrics.readIn.add(f);
        else S.metrics.readOut.add(f);
        const n = touchFile(f, "read");
        if (n) touched.push(n);
      }
      break;
    }
    case "grep":
    case "glob": {
      S.metrics.readTokens += ev.tokens || 0;
      for (const f of eventFilePaths(ev)) {
        const n = touchFile(f, ev.kind);
        if (n) touched.push(n);
      }
      break;
    }
    case "edit":
    case "write": {
      for (const f of eventFilePaths(ev)) {
        const n = touchFile(f, ev.kind);
        if (n) touched.push(n);
      }
      break;
    }
    default:
      break; // prompt & unknown kinds: no tree/metric effect
  }
  return touched;
}

/* ------------------------------- playback -------------------------------- */

function updatePlayBtn() {
  // U+FE0E forces text presentation — without it macOS renders color emoji
  els.btnPlay.textContent = S.playing ? "⏸︎" : "▶︎";
}

function play() {
  if (!S.events.length) return;
  if (S.playhead >= S.events.length) seekTo(0); // pressing play at the end restarts
  S.playing = true;
  updatePlayBtn();
  schedule();
}

function pause() {
  S.playing = false;
  if (S.timer) clearInterval(S.timer);
  S.timer = null;
  updatePlayBtn();
}

function schedule() {
  if (S.timer) clearInterval(S.timer);
  S.timer = setInterval(tick, BASE_INTERVAL_MS / S.speed);
}

function tick() {
  if (S.playhead >= S.events.length) {
    pause();
    updateTransport();
    return;
  }
  stepForwardLive();
}

// Incremental forward application of a single event (used by the play loop).
function stepForwardLive() {
  const ev = S.events[S.playhead];
  const touched = applyEventState(ev);
  S.playhead++;
  // touched-only mode: newly-touched nodes materialize in the tree now
  if (S.treeMode === "touched") {
    if (S.compactPaths) {
      // A node appearing can break / extend / create a compressed chain, so
      // incremental insertion isn't safe. Newly visible nodes are exactly the
      // touched nodes without a row — rebuild only then (the visible set is
      // small); mark-only changes go through highlightNodes as usual.
      if (touched.some((n) => !rowEl(n))) renderTree();
    } else {
      for (const n of touched) ensureNodeDom(n);
    }
  }
  highlightNodes(touched, ev?.kind);
  updateTransport();
  if (S.playhead >= S.events.length) pause();
}

// Seek anywhere. Forward: incremental application of the delta. Backward:
// full recompute from event 0 (plain loop over state, then re-render marks).
function seekTo(p) {
  if (!S.meta) return;
  p = Math.max(0, Math.min(S.events.length, Math.round(p)));
  if (p === S.playhead) return;

  if (p > S.playhead) {
    for (let i = S.playhead; i < p; i++) applyEventState(S.events[i]);
  } else {
    resetPlayState();
    for (let i = 0; i < p; i++) applyEventState(S.events[i]);
  }
  S.playhead = p;
  if (S.treeMode === "touched") {
    // visible set changed wholesale — rebuild from cumulative state (the
    // visible set is small, so this stays cheap even while scrubbing)
    renderTree();
  } else {
    updateAllRenderedRows();
  }

  if (p > 0) {
    const ev = S.events[p - 1];
    const nodes = eventFilePaths(ev)
      .map((f) => S.model.byPath.get(f))
      .filter(Boolean);
    highlightNodes(nodes, ev?.kind);
  }
  updateTransport();
}

function updateTransport() {
  updateLiveChips();
  updateReadout();
  updateTreeCounts();
  els.counter.textContent = `${fmtInt(S.playhead)} / ${fmtInt(S.events.length)}`;
  if (String(els.range.value) !== String(S.playhead)) els.range.value = String(S.playhead);
  els.pill.hidden = !(S.events.length > 0 && S.playhead >= S.events.length);
  updateSparkPlayhead();
}

/* -------------------------------- readout -------------------------------- */

function eventText(ev) {
  const err = ev.error ? " · error" : "";
  switch (ev.kind) {
    case "prompt":
      return `“${trunc(ev.text, 90)}”${err}`;
    case "read":
      return `${ev.file ?? "?"} · ${fmtInt(ev.lines || 0)} lines · ${fmtTok(ev.tokens)}${err}`;
    case "grep":
      return `“${trunc(ev.pattern, 40)}” · ${(ev.files || []).length} files · ${fmtTok(ev.tokens)}${err}`;
    case "glob":
      return `“${trunc(ev.pattern, 40)}” · ${(ev.files || []).length} files · ${fmtTok(ev.tokens)}${err}`;
    case "edit":
      return `${ev.file ?? "?"} · ${fmtTok(ev.tokens)}${err}`;
    case "write":
      return `${ev.file ?? "?"} · ${fmtInt(ev.lines || 0)} lines · ${fmtTok(ev.tokens)}${err}`;
    case "context":
      return `→ ${fmtK(ev.contextTokens || 0)}`;
    default:
      return String(ev.kind || "");
  }
}

function updateReadout() {
  const r = els.readout;
  r.textContent = "";
  r.classList.remove("sidechain", "err");
  if (!S.meta) return;

  const dim = (text) => {
    const s = document.createElement("span");
    s.className = "dim";
    s.textContent = text;
    r.appendChild(s);
  };

  if (!S.events.length) {
    dim("no events in this session");
    return;
  }
  if (S.playhead === 0) {
    dim("—");
    return;
  }

  const ev = S.events[S.playhead - 1];
  r.classList.toggle("sidechain", !!ev.sidechain);
  r.classList.toggle("err", !!ev.error);

  if (ev.sidechain) {
    const m = document.createElement("span");
    m.className = "side-mark";
    m.textContent = "◈ ";
    r.appendChild(m);
  }

  const label = document.createElement("span");
  label.className = "ev-kind";
  label.textContent = ev.kind === "context" ? "CTX" : String(ev.kind || "?").toUpperCase();
  label.style.color =
    ev.kind === "context"
      ? "var(--cyan)"
      : ev.kind === "prompt"
        ? "var(--text)"
        : KIND_COLOR[ev.kind] || "var(--text)";
  r.appendChild(label);

  const text = document.createElement("span");
  text.className = "ev-text";
  text.textContent = " " + eventText(ev);
  r.appendChild(text);
}

/* ------------------------------- sparkline ------------------------------- */

function buildSpark() {
  const svg = els.spark;
  svg.textContent = "";
  S.sparkLine = null;

  const W = 600;
  const H = 56;
  const PAD = 3;
  const total = S.events.length;

  let pts = [];
  let maxV = 0;
  for (let i = 0; i < total; i++) {
    const ev = S.events[i];
    if (ev?.kind === "context") {
      const v = ev.contextTokens || 0;
      pts.push([i, v]);
      if (v > maxV) maxV = v;
    }
  }

  // decimate to <= 600 points (keep the last point)
  if (pts.length > 600) {
    const step = Math.ceil(pts.length / 600);
    const keep = [];
    for (let j = 0; j < pts.length; j += step) keep.push(pts[j]);
    if (keep[keep.length - 1] !== pts[pts.length - 1]) keep.push(pts[pts.length - 1]);
    pts = keep;
  }

  const x = (i) => (total > 0 ? (i / total) * W : 0);
  const y = (v) => H - PAD - (maxV > 0 ? (v / maxV) * (H - 2 * PAD) : 0);

  // Colors come from CSS classes (spark-*) so both themes render correctly.
  if (pts.length === 1) {
    // a lone `M x,y` path draws no stroke — render a visible marker instead
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", x(pts[0][0]).toFixed(2));
    dot.setAttribute("cy", y(pts[0][1]).toFixed(2));
    dot.setAttribute("r", "2.5");
    dot.setAttribute("class", "spark-dot");
    svg.appendChild(dot);
  } else if (pts.length > 1) {
    let line = "";
    for (let j = 0; j < pts.length; j++) {
      line += (j === 0 ? "M" : "L") + x(pts[j][0]).toFixed(2) + "," + y(pts[j][1]).toFixed(2);
    }
    const area =
      line +
      `L${x(pts[pts.length - 1][0]).toFixed(2)},${H}` +
      `L${x(pts[0][0]).toFixed(2)},${H}Z`;

    const areaEl = document.createElementNS(SVG_NS, "path");
    areaEl.setAttribute("d", area);
    areaEl.setAttribute("class", "spark-area");
    svg.appendChild(areaEl);

    const lineEl = document.createElementNS(SVG_NS, "path");
    lineEl.setAttribute("d", line);
    lineEl.setAttribute("class", "spark-line");
    lineEl.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(lineEl);
  }

  const playhead = document.createElementNS(SVG_NS, "line");
  playhead.setAttribute("x1", "0");
  playhead.setAttribute("x2", "0");
  playhead.setAttribute("y1", "0");
  playhead.setAttribute("y2", String(H));
  playhead.setAttribute("class", "spark-playhead");
  playhead.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(playhead);
  S.sparkLine = playhead;

  els.sparkPeak.textContent = maxV > 0 ? `peak ${fmtK(maxV)}` : "";
}

function updateSparkPlayhead() {
  if (!S.sparkLine) return;
  const total = S.events.length;
  const xx = total > 0 ? (S.playhead / total) * 600 : 0;
  S.sparkLine.setAttribute("x1", xx.toFixed(2));
  S.sparkLine.setAttribute("x2", xx.toFixed(2));
}

/* ----------------------------- controls / keys --------------------------- */

els.btnPlay.addEventListener("click", () => (S.playing ? pause() : play()));

els.btnRestart.addEventListener("click", () => {
  seekTo(0);
  if (S.playing) schedule();
});

els.btnBack.addEventListener("click", () => {
  pause();
  seekTo(S.playhead - 1);
});

els.btnFwd.addEventListener("click", () => {
  pause();
  seekTo(S.playhead + 1);
});

els.speed.addEventListener("change", () => {
  S.speed = parseFloat(els.speed.value) || 1;
  if (S.playing) schedule();
});

// Scrub: rAF-throttled so 10k+ event sessions stay smooth while dragging.
let scrubTarget = null;
let scrubRaf = 0;
els.range.addEventListener("input", () => {
  pause();
  scrubTarget = Math.round(Number(els.range.value) || 0);
  if (!scrubRaf) {
    scrubRaf = requestAnimationFrame(() => {
      scrubRaf = 0;
      if (scrubTarget != null) {
        const t = scrubTarget;
        scrubTarget = null;
        seekTo(t);
      }
    });
  }
});

window.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t === els.filter || t === els.dirFilter || t?.tagName === "SELECT" || t?.tagName === "TEXTAREA")
    return;
  if (t?.tagName === "INPUT" && t.type === "search") return;
  if (!S.meta || !S.events.length) return;
  const jump = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case " ":
      e.preventDefault();
      S.playing ? pause() : play();
      break;
    case "ArrowLeft":
      e.preventDefault();
      pause();
      seekTo(S.playhead - jump);
      break;
    case "ArrowRight":
      e.preventDefault();
      pause();
      seekTo(S.playhead + jump);
      break;
  }
});

els.filter.addEventListener("input", () => {
  S.filter = els.filter.value;
  renderList();
});

els.treeModeBtn.addEventListener("click", () => {
  S.treeMode = S.treeMode === "touched" ? "full" : "touched";
  storedSet(TREE_MODE_KEY, S.treeMode);
  if (S.model) renderTree();
  else updateTreeToolbar();
});

els.treeCompactBtn.addEventListener("click", () => {
  S.compactPaths = !S.compactPaths;
  storedSet(TREE_PATHS_KEY, S.compactPaths ? "compact" : "all");
  if (S.model) renderTree();
  else updateTreeToolbar();
});

/* --------------------------------- theme --------------------------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // U+FE0E forces text presentation (no color emoji)
  els.themeToggle.textContent = theme === "light" ? "☾︎" : "☀︎";
  els.themeToggle.title = theme === "light" ? "switch to dark theme" : "switch to light theme";
}

function initTheme() {
  const stored = storedGet(THEME_KEY);
  const theme =
    stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia?.("(prefers-color-scheme: light)")?.matches
        ? "light"
        : "dark";
  applyTheme(theme);
}

els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  storedSet(THEME_KEY, next);
});

/* --------------------------------- init ---------------------------------- */

initTheme();
updatePlayBtn();
updateTreeToolbar();
loadSessions();
