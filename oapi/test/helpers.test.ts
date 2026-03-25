import { describe, expect, test } from "bun:test";
import {
  collapseNullable,
  extractEnumValues,
  flattenProperties,
  getSchemaType,
  isRequired,
} from "../src/spec/helpers.ts";

describe("collapseNullable", () => {
  test("collapses anyOf with null variant", () => {
    const schema = {
      anyOf: [{ type: "string" }, { type: "null" }],
    };
    const result = collapseNullable(schema);
    expect(result).toEqual({ type: "string", nullable: true });
  });

  test("preserves outer title and description", () => {
    const schema = {
      title: "Name",
      description: "A name field",
      anyOf: [{ type: "string" }, { type: "null" }],
    };
    const result = collapseNullable(schema);
    expect(result.title).toBe("Name");
    expect(result.description).toBe("A name field");
    expect(result.nullable).toBe(true);
  });

  test("returns original if not nullable anyOf pattern", () => {
    const schema = { type: "string" };
    expect(collapseNullable(schema)).toEqual(schema);
  });

  test("returns original if anyOf has more than 2 variants", () => {
    const schema = {
      anyOf: [{ type: "string" }, { type: "integer" }, { type: "null" }],
    };
    expect(collapseNullable(schema)).toEqual(schema);
  });

  test("returns original if anyOf has no null variant", () => {
    const schema = {
      anyOf: [{ type: "string" }, { type: "integer" }],
    };
    expect(collapseNullable(schema)).toEqual(schema);
  });
});

describe("getSchemaType", () => {
  test("returns basic types", () => {
    expect(getSchemaType({ type: "string" })).toBe("string");
    expect(getSchemaType({ type: "integer" })).toBe("integer");
    expect(getSchemaType({ type: "number" })).toBe("number");
    expect(getSchemaType({ type: "boolean" })).toBe("boolean");
  });

  test("returns enum with values", () => {
    expect(getSchemaType({ enum: ["a", "b", "c"] })).toBe("enum(a|b|c)");
  });

  test("returns array with item type", () => {
    expect(getSchemaType({ type: "array", items: { type: "string" } })).toBe("array<string>");
  });

  test("returns array without items", () => {
    expect(getSchemaType({ type: "array" })).toBe("array");
  });

  test("returns object for object type", () => {
    expect(getSchemaType({ type: "object" })).toBe("object");
  });

  test("returns nullable type with ?", () => {
    const schema = { anyOf: [{ type: "string" }, { type: "null" }] };
    expect(getSchemaType(schema)).toBe("string?");
  });

  test("returns nullable enum", () => {
    const schema = { anyOf: [{ type: "string", enum: ["x", "y"] }, { type: "null" }] };
    expect(getSchemaType(schema)).toBe("enum(x|y)?");
  });

  test("returns object for allOf/oneOf without type", () => {
    expect(getSchemaType({ allOf: [{ type: "object" }] })).toBe("object");
    expect(getSchemaType({ oneOf: [{ type: "object" }] })).toBe("object");
  });

  test("returns unknown for empty schema", () => {
    expect(getSchemaType({})).toBe("unknown");
  });
});

describe("isRequired", () => {
  test("returns true when field is in required array", () => {
    expect(isRequired("name", { required: ["name", "id"] })).toBe(true);
  });

  test("returns false when field is not required", () => {
    expect(isRequired("age", { required: ["name", "id"] })).toBe(false);
  });

  test("returns false when no required array", () => {
    expect(isRequired("name", {})).toBe(false);
  });

  test("returns false when required is not an array", () => {
    expect(isRequired("name", { required: "name" })).toBe(false);
  });
});

describe("extractEnumValues", () => {
  test("extracts enum values", () => {
    expect(extractEnumValues({ enum: ["a", "b", "c"] })).toEqual(["a", "b", "c"]);
  });

  test("extracts enum from nullable schema", () => {
    const schema = { anyOf: [{ type: "string", enum: ["x", "y"] }, { type: "null" }] };
    expect(extractEnumValues(schema)).toEqual(["x", "y"]);
  });

  test("returns undefined when no enum", () => {
    expect(extractEnumValues({ type: "string" })).toBeUndefined();
  });
});

describe("flattenProperties", () => {
  test("returns direct properties", () => {
    const schema = {
      properties: { name: { type: "string" }, age: { type: "integer" } },
      required: ["name"],
    };
    const result = flattenProperties(schema);
    expect(Object.keys(result.properties)).toEqual(["name", "age"]);
    expect(result.required).toEqual(["name"]);
  });

  test("merges allOf sub-schemas", () => {
    const schema = {
      allOf: [
        { properties: { name: { type: "string" } }, required: ["name"] },
        { properties: { age: { type: "integer" } }, required: ["age"] },
      ],
    };
    const result = flattenProperties(schema);
    expect(Object.keys(result.properties).sort()).toEqual(["age", "name"]);
    expect(result.required.sort()).toEqual(["age", "name"]);
  });

  test("merges oneOf properties but not required", () => {
    const schema = {
      oneOf: [
        { properties: { name: { type: "string" } }, required: ["name"] },
        { properties: { id: { type: "integer" } }, required: ["id"] },
      ],
    };
    const result = flattenProperties(schema);
    expect(Object.keys(result.properties).sort()).toEqual(["id", "name"]);
    // oneOf required should NOT be merged
    expect(result.required).toEqual([]);
  });

  test("deduplicates required fields", () => {
    const schema = {
      required: ["name"],
      allOf: [{ required: ["name", "id"] }],
    };
    const result = flattenProperties(schema);
    expect(result.required.sort()).toEqual(["id", "name"]);
  });

  test("handles empty schema", () => {
    const result = flattenProperties({});
    expect(result.properties).toEqual({});
    expect(result.required).toEqual([]);
  });
});
