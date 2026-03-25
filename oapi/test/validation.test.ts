import { describe, expect, test } from "bun:test";
import { validateInput } from "../src/validation/index.ts";

describe("validateInput", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      type: { type: "string", enum: ["a", "b", "c"] },
      count: { type: "integer" },
    },
    required: ["name", "type"],
  };

  test("valid data passes", () => {
    const result = validateInput(schema, { name: "test", type: "a" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("valid data with optional field passes", () => {
    const result = validateInput(schema, { name: "test", type: "b", count: 5 });
    expect(result.valid).toBe(true);
  });

  test("missing required field reports error", () => {
    const result = validateInput(schema, { name: "test" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  test("missing multiple required fields reports all", () => {
    const result = validateInput(schema, {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("invalid enum value reports error", () => {
    const result = validateInput(schema, { name: "test", type: "invalid" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("one of"))).toBe(true);
  });

  test("wrong type reports error", () => {
    const result = validateInput(schema, { name: 123, type: "a" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  test("empty schema accepts anything", () => {
    const result = validateInput({}, { anything: true });
    expect(result.valid).toBe(true);
  });
});
