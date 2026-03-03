/**
 * Imgflip API client for meme generation
 * API docs: https://imgflip.com/api
 */

import { readCache, writeCache } from "./cache.js";

const API_BASE = "https://api.imgflip.com";

export interface MemeTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
}

export interface GenerateResult {
  url: string;
  page_url: string;
}

/** Popular template aliases → imgflip template IDs */
export const TEMPLATE_ALIASES: Record<string, string> = {
  drake: "181913649",
  drake_hotline_bling: "181913649",
  distracted_boyfriend: "112126428",
  two_buttons: "87743020",
  left_exit: "124822590",
  this_is_fine: "55311130",
  hide_the_pain_harold: "27813981",
  woman_yelling_at_cat: "188390779",
  surprised_pikachu: "155067746",
  success_kid: "61544",
  expanding_brain: "93895088",
  galaxy_brain: "93895088",
  gru_plan: "131940431",
  bike_fall: "100777631",
  stonks: "178591752",
  panik_kalm: "132769734",
  buff_doge: "247375501",
  change_my_mind: "129242436",
  roll_safe: "89370399",
  disaster_girl: "97984",
  evil_kermit: "84341851",
  monkey_puppet: "148909805",
  doge: "8072285",
  bad_luck_brian: "61585",
  boardroom_meeting: "112126428",
  ancient_aliens: "101470",
};

/** @deprecated Use TEMPLATE_ALIASES instead */
export const POPULAR_TEMPLATES = TEMPLATE_ALIASES;

async function fetchTemplatesFromAPI(): Promise<MemeTemplate[]> {
  const res = await fetch(`${API_BASE}/get_memes`);
  const data = await res.json();

  if (!data.success) {
    throw new Error(`Imgflip API error: ${data.error_message}`);
  }

  return data.data.memes;
}

/**
 * Get all available templates. Uses local cache (24h TTL) to avoid
 * hitting the imgflip API on every invocation.
 */
export async function getTemplates(forceRefresh = false): Promise<MemeTemplate[]> {
  if (!forceRefresh) {
    const cached = await readCache();
    if (cached) return cached.templates;
  }

  const templates = await fetchTemplatesFromAPI();
  await writeCache(templates);
  return templates;
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-]/g, "_")
    .replace(/'/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

/** Find a template by name, alias, or ID. Returns the full template with box_count. */
export async function findTemplate(templateName: string): Promise<MemeTemplate> {
  const templates = await getTemplates();

  // If it's a numeric ID, find it in the catalog
  if (/^\d+$/.test(templateName)) {
    const match = templates.find((t) => t.id === templateName);
    if (match) return match;
    // ID not in top 100 — return minimal object (default box_count=2)
    return { id: templateName, name: "Unknown", url: "", width: 0, height: 0, box_count: 2 };
  }

  const key = normalizeKey(templateName);

  // Check aliases first — resolve to catalog entry for box_count
  if (TEMPLATE_ALIASES[key]) {
    const aliasId = TEMPLATE_ALIASES[key];
    const match = templates.find((t) => t.id === aliasId);
    if (match) return match;
    return { id: aliasId, name: key, url: "", width: 0, height: 0, box_count: 2 };
  }

  // Exact name match
  for (const t of templates) {
    if (t.name.toLowerCase() === templateName.toLowerCase()) return t;
  }

  // Normalized key match
  for (const t of templates) {
    if (normalizeKey(t.name) === key) return t;
  }

  // Partial match
  for (const t of templates) {
    if (t.name.toLowerCase().includes(templateName.toLowerCase())) return t;
  }

  throw new Error(
    `Template "${templateName}" not found. Use "meme-gen list" to see available templates.`
  );
}

/** Find template ID by name, alias, or numeric ID */
export async function findTemplateId(templateName: string): Promise<string> {
  const template = await findTemplate(templateName);
  return template.id;
}

/** Generate a meme using the boxes[] API for multi-box support */
export async function generateMeme(opts: {
  username: string;
  password: string;
  templateName: string;
  texts: string[];
  font?: string;
}): Promise<GenerateResult & { template: MemeTemplate }> {
  const template = await findTemplate(opts.templateName);

  const body = new URLSearchParams({
    template_id: template.id,
    username: opts.username,
    password: opts.password,
    font: opts.font ?? "impact",
  });

  // Use boxes[] API for proper multi-box support
  for (let i = 0; i < opts.texts.length; i++) {
    body.append(`boxes[${i}][text]`, opts.texts[i]);
  }

  const res = await fetch(`${API_BASE}/caption_image`, {
    method: "POST",
    body,
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(`Imgflip API error: ${data.error_message}`);
  }

  return {
    url: data.data.url,
    page_url: data.data.page_url,
    template,
  };
}

export async function downloadMeme(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  await Bun.write(outputPath, buffer);
}

export async function searchTemplates(query: string): Promise<MemeTemplate[]> {
  const templates = await getTemplates();
  const q = query.toLowerCase();
  return templates.filter((t) => t.name.toLowerCase().includes(q));
}
