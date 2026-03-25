import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

// Single ajv instance, reused across validations
let ajvInstance: InstanceType<typeof Ajv2020> | null = null;

function getAjv(): InstanceType<typeof Ajv2020> {
  if (!ajvInstance) {
    ajvInstance = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate data against a JSON Schema.
 * Returns human-readable error messages.
 */
export function validateInput(schema: object, data: unknown): ValidationResult {
  const ajv = getAjv();

  try {
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = (validate.errors || []).map((err) => {
      const path = err.instancePath ? err.instancePath.replace(/^\//, "").replace(/\//g, ".") : "";

      switch (err.keyword) {
        case "required": {
          const prop = (err.params as Record<string, unknown>).missingProperty as string;
          return `Missing required field: '${prop}'`;
        }
        case "enum": {
          const allowed = (err.params as Record<string, unknown>).allowedValues as unknown[];
          return path
            ? `'${path}' must be one of: ${allowed.join(", ")}`
            : `Must be one of: ${allowed.join(", ")}`;
        }
        case "type": {
          const expected = (err.params as Record<string, unknown>).type as string;
          return path ? `'${path}' must be of type ${expected}` : `Must be of type ${expected}`;
        }
        case "additionalProperties": {
          const prop = (err.params as Record<string, unknown>).additionalProperty as string;
          return `Unknown field: '${prop}'`;
        }
        case "minLength":
        case "maxLength":
        case "minimum":
        case "maximum":
        case "pattern":
        case "format":
          return path ? `'${path}': ${err.message}` : (err.message ?? "Validation error");
        default:
          return path ? `'${path}': ${err.message}` : (err.message ?? "Validation error");
      }
    });

    // Deduplicate
    return { valid: false, errors: [...new Set(errors)] };
  } catch {
    // Schema compilation error — skip validation gracefully
    return { valid: true, errors: [] };
  }
}
