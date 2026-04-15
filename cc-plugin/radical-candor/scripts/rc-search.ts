#!/usr/bin/env bun
/**
 * rc-search — query radicalcandor.com for articles/podcasts on a topic.
 *
 * Usage:
 *   bun run scripts/rc-search.ts <query> [--limit 10] [--kind blog|podcast|all]
 *   bun run scripts/rc-search.ts <query> --fetch         # also download top result
 *
 * Caches the sitemap at /tmp/rc-sitemap.xml for 24h.
 */

const SITEMAP_URL = "https://www.radicalcandor.com/sitemap.xml";
const CACHE_PATH = "/tmp/rc-sitemap.xml";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function loadSitemap(): Promise<string> {
  const f = Bun.file(CACHE_PATH);
  if (await f.exists()) {
    const stat = await f.stat();
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) return f.text();
  }
  const res = await fetch(SITEMAP_URL, { headers: { "User-Agent": "rc-search/1" } });
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`);
  const text = await res.text();
  await Bun.write(CACHE_PATH, text);
  return text;
}

function extractUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function slugScore(url: string, terms: string[]): number {
  const slug = url.replace(/^https?:\/\/[^/]+\//, "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const hits = slug.match(re);
    if (hits) score += hits.length * 2;
    else if (slug.includes(t.toLowerCase())) score += 1;
  }
  return score;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(header|footer|nav)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(h[1-6]|p|li|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function main() {
  const args = Bun.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: rc-search <query> [--limit N] [--kind blog|podcast|all] [--fetch]");
    process.exit(0);
  }
  let limit = 10;
  let kind: "blog" | "podcast" | "all" = "all";
  let doFetch = false;
  const terms: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--limit") limit = parseInt(args[++i], 10);
    else if (a === "--kind") kind = args[++i] as typeof kind;
    else if (a === "--fetch") doFetch = true;
    else terms.push(a);
  }

  const xml = await loadSitemap();
  const urls = extractUrls(xml).filter((u) => {
    if (kind === "blog") return u.includes("/blog/");
    if (kind === "podcast") return u.includes("/podcast/");
    return true;
  });

  const scored = urls
    .map((u) => ({ url: u, score: slugScore(u, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.log(JSON.stringify(scored, null, 2));

  if (doFetch && scored.length > 0) {
    const res = await fetch(scored[0].url);
    const text = stripHtml(await res.text());
    console.log("\n=== CONTENT ===\n");
    console.log(text);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
