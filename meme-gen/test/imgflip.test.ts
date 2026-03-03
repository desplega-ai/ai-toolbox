import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  findTemplate,
  findTemplateId,
  getTemplates,
  searchTemplates,
  TEMPLATE_ALIASES,
} from "../src/imgflip";
import { readCache, writeCache, clearCache } from "../src/cache";
import type { MemeTemplate } from "../src/imgflip";

describe("getTemplates", () => {
  test("fetches templates from API", async () => {
    const templates = await getTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]).toHaveProperty("id");
    expect(templates[0]).toHaveProperty("name");
    expect(templates[0]).toHaveProperty("box_count");
  });
});

describe("template cache", () => {
  const fakeTemplates: MemeTemplate[] = [
    { id: "1", name: "Test Meme", url: "http://example.com/1.jpg", width: 500, height: 500, box_count: 2 },
    { id: "2", name: "Another Meme", url: "http://example.com/2.jpg", width: 600, height: 400, box_count: 3 },
  ];

  afterAll(async () => {
    await clearCache();
  });

  test("writeCache + readCache round-trip", async () => {
    await writeCache(fakeTemplates);
    const cached = await readCache();
    expect(cached).not.toBeNull();
    expect(cached!.templates).toHaveLength(2);
    expect(cached!.templates[0].name).toBe("Test Meme");
  });

  test("clearCache removes cached data", async () => {
    await writeCache(fakeTemplates);
    await clearCache();
    const cached = await readCache();
    expect(cached).toBeNull();
  });

  test("getTemplates uses cache on second call", async () => {
    // First call fetches from API and caches
    const first = await getTemplates(true);
    expect(first.length).toBeGreaterThan(0);

    // Second call should use cache (same result)
    const second = await getTemplates();
    expect(second.length).toBe(first.length);
    expect(second[0].id).toBe(first[0].id);
  });
});

describe("findTemplate", () => {
  test("returns full template object with box_count", async () => {
    const t = await findTemplate("drake");
    expect(t.id).toBe("181913649");
    expect(t.name).toBeDefined();
    expect(t.box_count).toBeGreaterThan(0);
  });

  test("resolves numeric ID to full template", async () => {
    const t = await findTemplate("181913649");
    expect(t.id).toBe("181913649");
    expect(t.box_count).toBeGreaterThan(0);
  });

  test("returns default box_count=2 for unknown numeric ID", async () => {
    const t = await findTemplate("999999999");
    expect(t.id).toBe("999999999");
    expect(t.box_count).toBe(2);
  });

  test("throws for unknown name", async () => {
    expect(findTemplate("zzz_nonexistent_zzz")).rejects.toThrow("not found");
  });
});

describe("findTemplateId", () => {
  test("resolves numeric ID directly", async () => {
    const id = await findTemplateId("181913649");
    expect(id).toBe("181913649");
  });

  test("resolves alias", async () => {
    const id = await findTemplateId("drake");
    expect(id).toBe("181913649");
  });

  test("resolves full name from catalog", async () => {
    const id = await findTemplateId("Drake Hotline Bling");
    expect(id).toBe("181913649");
  });

  test("resolves partial name from catalog", async () => {
    const id = await findTemplateId("Two Buttons");
    expect(id).toBeDefined();
    expect(/^\d+$/.test(id)).toBe(true);
  });

  test("throws for unknown template", async () => {
    expect(findTemplateId("zzz_nonexistent_zzz")).rejects.toThrow("not found");
  });
});

describe("searchTemplates", () => {
  test("finds templates by partial name", async () => {
    const results = await searchTemplates("drake");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("drake");
  });

  test("returns empty array for no matches", async () => {
    const results = await searchTemplates("zzz_nonexistent_zzz");
    expect(results).toHaveLength(0);
  });
});

describe("TEMPLATE_ALIASES", () => {
  test("has core templates", () => {
    expect(TEMPLATE_ALIASES.drake).toBeDefined();
    expect(TEMPLATE_ALIASES.this_is_fine).toBeDefined();
    expect(TEMPLATE_ALIASES.expanding_brain).toBeDefined();
  });

  test("aliases map to numeric IDs", () => {
    for (const [alias, id] of Object.entries(TEMPLATE_ALIASES)) {
      expect(/^\d+$/.test(id)).toBe(true);
    }
  });
});
