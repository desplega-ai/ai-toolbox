/**
 * Footnotes for the preview. The markdown is rendered without footnote
 * support (so source offsets stay exact), then this post-pass turns `[^id]`
 * references into superscript links and marks `[^id]: text` definition lines.
 */

const DEF_MARKER = /^\[\^([^\]\s]+)\]:[ \t]*/;
const REF_PATTERN = /\[\^([^\]\s]+)\]/g;
const SKIP_SELECTOR = "code, pre, .mermaid, .mermaid-error, a";

export type FootnotePart = string | { id: string };

/** Parse a definition marker at the start of `text`. */
export function parseFootnoteDef(text: string): { id: string; length: number } | null {
  const m = DEF_MARKER.exec(text);
  return m ? { id: m[1], length: m[0].length } : null;
}

/** Split text into plain strings and `[^id]` references. */
export function splitFootnoteRefs(text: string): FootnotePart[] {
  const parts: FootnotePart[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_PATTERN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Number footnotes by first reference order. Only ids with a definition get a
 * number; definitions that are never referenced follow in definition order.
 */
export function numberFootnotes(refIds: string[], defIds: string[]): Map<string, number> {
  const defined = new Set(defIds);
  const numbers = new Map<string, number>();
  for (const id of [...refIds, ...defIds]) {
    if (defined.has(id) && !numbers.has(id)) numbers.set(id, numbers.size + 1);
  }
  return numbers;
}

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.parentElement?.closest(SKIP_SELECTOR)) out.push(node as Text);
  }
  return out;
}

function hrefFor(prefix: string, id: string): string {
  return `#${prefix}-${encodeURIComponent(id)}`;
}

/** Apply footnote references and definitions to a rendered preview. */
export function applyFootnotes(container: HTMLElement): void {
  // Definitions: paragraphs (or per-line paragraph rows) starting with
  // `[^id]:`. Swap the marker for a label first so it is not read as a ref.
  const defs: Array<{ el: HTMLElement; id: string; label: HTMLElement }> = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("p"))) {
    const first = textNodes(el).find((t) => (t.nodeValue ?? "") !== "");
    const def = first ? parseFootnoteDef(first.nodeValue ?? "") : null;
    if (!first || !def) continue;
    const label = document.createElement("span");
    label.className = "footnote-label";
    first.nodeValue = (first.nodeValue ?? "").slice(def.length);
    first.before(label, " ");
    defs.push({ el, id: def.id, label });
  }
  if (defs.length === 0) return;

  const refNodes = textNodes(container).filter((t) => (t.nodeValue ?? "").includes("[^"));
  const refIds = refNodes.flatMap((t) =>
    splitFootnoteRefs(t.nodeValue ?? "").flatMap((p) => (typeof p === "string" ? [] : [p.id]))
  );
  const numbers = numberFootnotes(refIds, defs.map((d) => d.id));

  const refCounts = new Map<string, number>();
  for (const node of refNodes) {
    const fragment = document.createDocumentFragment();
    for (const part of splitFootnoteRefs(node.nodeValue ?? "")) {
      const n = typeof part === "string" ? undefined : numbers.get(part.id);
      if (typeof part === "string" || n === undefined) {
        fragment.append(typeof part === "string" ? part : `[^${part.id}]`);
        continue;
      }
      const count = (refCounts.get(part.id) ?? 0) + 1;
      refCounts.set(part.id, count);
      const link = document.createElement("a");
      link.href = hrefFor("fn", part.id);
      link.id = count === 1 ? `fnref-${part.id}` : `fnref-${part.id}-${count}`;
      link.textContent = String(n);
      link.setAttribute("aria-label", `Footnote ${n}`);
      const sup = document.createElement("sup");
      sup.className = "footnote-ref";
      sup.appendChild(link);
      fragment.appendChild(sup);
    }
    node.replaceWith(fragment);
  }

  for (const { el, id, label } of defs) {
    const n = numbers.get(id)!;
    el.id = `fn-${id}`;
    el.classList.add("footnote-def");
    label.textContent = `${n}.`;
    if (!refCounts.has(id)) continue;
    const back = document.createElement("a");
    back.className = "footnote-backref";
    back.href = hrefFor("fnref", id);
    back.textContent = "\u21A9\uFE0E";
    back.title = "Back to reference";
    back.setAttribute("aria-label", `Back to reference ${n}`);
    el.append(" ", back);
  }
}
