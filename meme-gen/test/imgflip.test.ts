import { describe, test, expect } from "bun:test";
import { findTemplateId, getTemplates, searchTemplates, POPULAR_TEMPLATES } from "../src/imgflip";

describe("getTemplates", () => {
  test("fetches templates from API", async () => {
    const templates = await getTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]).toHaveProperty("id");
    expect(templates[0]).toHaveProperty("name");
    expect(templates[0]).toHaveProperty("box_count");
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

  test("resolves full name", async () => {
    const id = await findTemplateId("Drake Hotline Bling");
    expect(id).toBe("181913649");
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
});

describe("POPULAR_TEMPLATES", () => {
  test("has core templates", () => {
    expect(POPULAR_TEMPLATES.drake).toBeDefined();
    expect(POPULAR_TEMPLATES.this_is_fine).toBeDefined();
    expect(POPULAR_TEMPLATES.expanding_brain).toBeDefined();
  });
});
