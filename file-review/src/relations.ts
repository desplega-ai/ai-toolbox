import type { Token } from "marked";
import { API, type Backlink } from "./api";
import { icons, type IconName } from "./icons";
import { openLightbox, type LightboxImage } from "./lightbox";
import { checkExists, describeLink, followHref, openDocument, resolveHref } from "./links";
import { lexMarkdown, parseLeadingFrontmatter } from "./markdown-preview";
import type { Tab } from "./tabs";

// The "Links" tab of the left rail: what this file links to, and which
// markdown files link to it.

export interface MarkdownLink {
  href: string;
  text: string;
  image: boolean;
}

export type LinkSection = "docs" | "files" | "images" | "external";

export interface LinkRow {
  label: string;
  /** Resolved path (with fragment) or URL. */
  detail: string;
  href: string;
  /** Absolute path of a local target. */
  path?: string;
}

const SECTIONS: Array<{ id: LinkSection; title: string; icon: IconName }> = [
  { id: "docs", title: "Documents", icon: "file-text" },
  { id: "files", title: "Files", icon: "file" },
  { id: "images", title: "Images", icon: "image" },
  { id: "external", title: "External", icon: "external-link" },
];

const RENDER_DELAY = 250;

type TokenTree = {
  type: string;
  text?: string;
  tokens?: Token[];
  items?: Array<{ tokens: Token[] }>;
  header?: Array<{ tokens: Token[] }>;
  rows?: Array<Array<{ tokens: Token[] }>>;
};

function plainText(token: Token): string {
  const t = token as unknown as TokenTree;
  if (t.tokens && t.tokens.length > 0) return t.tokens.map(plainText).join("");
  return t.type === "html" ? "" : (t.text ?? "");
}

/** Every link and image in `markdown`, in source order. */
export function collectLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const visit = (tokens: Token[] | undefined) => {
    for (const token of tokens ?? []) {
      if (token.type === "link" || token.type === "image") {
        const image = token.type === "image";
        const text = image ? (token.text ?? "") : plainText(token);
        links.push({ href: token.href ?? "", text: text.trim(), image });
      }
      const t = token as unknown as TokenTree;
      visit(t.tokens);
      t.items?.forEach((item) => visit(item.tokens));
      t.header?.forEach((cell) => visit(cell.tokens));
      t.rows?.forEach((row) => row.forEach((cell) => visit(cell.tokens)));
    }
  };
  visit(lexMarkdown(parseLeadingFrontmatter(markdown).bodyMarkdown));
  return links;
}

/** Sort links into sections, one row per distinct target. Anchors and unsupported links are dropped. */
export function groupLinks(
  links: MarkdownLink[],
  currentPath: string | null
): Record<LinkSection, LinkRow[]> {
  const groups: Record<LinkSection, LinkRow[]> = { docs: [], files: [], images: [], external: [] };
  const seen = new Set<string>();
  for (const { href, text, image } of links) {
    const link = resolveHref(href, currentPath);
    const local = link.kind === "doc" || link.kind === "file";
    let section: LinkSection;
    if (image) {
      if (!local && link.kind !== "external") continue;
      section = "images";
    } else if (link.kind === "doc") {
      section = "docs";
    } else if (link.kind === "file") {
      section = "files";
    } else if (link.kind === "external") {
      section = "external";
    } else {
      continue;
    }
    const detail = describeLink(link, href);
    if (seen.has(`${section} ${detail}`)) continue;
    seen.add(`${section} ${detail}`);
    const path = local ? link.path : undefined;
    const name = path ? path.slice(path.lastIndexOf("/") + 1) : detail;
    groups[section].push({ label: text || name, detail, href, path });
  }
  return groups;
}

/** `path` relative to the folder of `from` when it is inside it, else unchanged. */
export function relativeToFile(path: string, from: string | null): string {
  if (!from) return path;
  const dir = from.slice(0, from.lastIndexOf("/") + 1);
  return dir && path.startsWith(dir) ? path.slice(dir.length) : path;
}

interface RelationsDeps {
  getActiveTab: () => Tab | null;
  /** Current markdown of the active tab (the editor doc). */
  getContent: () => string;
}

let deps: RelationsDeps | null = null;
let renderTimer: number | undefined;
// Backlinks are searched once per tab activation, and only while the panel shows.
let backlinksPath: string | null = null;
let backlinks: Backlink[] | null = null;
let backlinksFailed = false;
let backlinksGeneration = 0;

const listEl = () => document.getElementById("links-list");

function panelShown(): boolean {
  return (listEl()?.getClientRects().length ?? 0) > 0;
}

export function initRelations(relationsDeps: RelationsDeps) {
  deps = relationsDeps;
  const list = listEl();
  // Opening the rail or the tab makes the panel visible: search then.
  if (list && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      if (panelShown() && backlinksPath !== (deps?.getActiveTab()?.path ?? null)) renderRelations();
    }).observe(list);
  }
}

/** Re-render the panel soon (after a preview render or an edit). */
export function scheduleRelationsUpdate() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderRelations, RENDER_DELAY);
}

/** A tab became active: search backlinks again and re-render. */
export function resetRelations() {
  backlinksPath = null;
  backlinks = null;
  backlinksGeneration++;
  scheduleRelationsUpdate();
}

function ensureBacklinks(path: string) {
  if (backlinksPath === path || !panelShown()) return;
  backlinksPath = path;
  backlinks = null;
  backlinksFailed = false;
  const generation = ++backlinksGeneration;
  API.findBacklinks(path)
    .then((items) => {
      if (generation !== backlinksGeneration) return;
      backlinks = items;
      renderRelations();
    })
    .catch((error) => {
      if (generation !== backlinksGeneration) return;
      console.error("Failed to find backlinks:", error);
      backlinksFailed = true;
      renderRelations();
    });
}

function rowEl(icon: IconName, label: string, detail: string, title: string, onClick: () => void) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "links-row";
  row.title = title;
  row.innerHTML = `<span class="links-row-icon">${icons[icon]}</span><span class="links-row-text"><span class="links-row-label"></span><span class="links-row-detail"></span></span>`;
  row.querySelector(".links-row-label")!.textContent = label;
  row.querySelector(".links-row-detail")!.textContent = detail;
  row.addEventListener("click", onClick);
  return row;
}

function sectionEl(title: string, count: number | null, children: HTMLElement[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "links-section";
  const header = document.createElement("div");
  header.className = "links-section-title";
  header.textContent = title;
  if (count !== null) {
    const badge = document.createElement("span");
    badge.className = "links-count";
    badge.textContent = String(count);
    header.appendChild(badge);
  }
  section.append(header, ...children);
  return section;
}

function noteEl(text: string): HTMLElement {
  const note = document.createElement("div");
  note.className = "links-empty";
  note.textContent = text;
  return note;
}

function markBroken(row: HTMLElement, path: string) {
  void checkExists(path).then((exists) => {
    if (exists || !row.isConnected) return;
    row.classList.add("broken");
    row.title = `Not found: ${path}`;
  });
}

function renderRelations() {
  const list = listEl();
  if (!list || !deps) return;
  const tab = deps.getActiveTab();
  if (!tab?.isMarkdownFile) {
    list.replaceChildren();
    return;
  }
  if (tab.path) ensureBacklinks(tab.path);

  const groups = groupLinks(collectLinks(deps.getContent()), tab.path);
  const sections: HTMLElement[] = [];
  for (const { id, title, icon } of SECTIONS) {
    const rows = groups[id];
    if (rows.length === 0) continue;
    const images: LightboxImage[] = rows.map((r) => ({
      src: r.path ? API.assetUrl(r.path) : r.detail,
      caption: r.label,
      path: r.path,
    }));
    const els = rows.map((row, index) => {
      const shown = row.path ? relativeToFile(row.detail, tab.path) : row.detail;
      const el = rowEl(icon, row.label, shown, row.detail, () => {
        if (id === "images") openLightbox({ kind: "image", ...images[index], items: images, index });
        else void followHref(row.href);
      });
      if (row.path) markBroken(el, row.path);
      return el;
    });
    sections.push(sectionEl(title, rows.length, els));
  }
  if (sections.length === 0) sections.push(noteEl("No links in this file"));

  let incoming: HTMLElement[];
  if (!tab.path) incoming = [noteEl("Save the file to find references")];
  else if (backlinksFailed) incoming = [noteEl("Could not search for references")];
  else if (backlinks === null) incoming = [noteEl("Searching…")];
  else if (backlinks.length === 0) incoming = [noteEl("No other files link here")];
  else {
    incoming = backlinks.map((link) => {
      const name = link.path.slice(link.path.lastIndexOf("/") + 1);
      const where = `${relativeToFile(link.path, tab.path)}:${link.line}`;
      const title = link.text ? `${link.path}:${link.line}\n${link.text}` : `${link.path}:${link.line}`;
      return rowEl("link", name, where, title, () => void openDocument(link.path));
    });
  }
  sections.push(sectionEl("Referenced by", backlinks?.length ?? null, incoming));

  list.replaceChildren(...sections);
}
