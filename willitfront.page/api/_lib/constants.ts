export const DEFAULT_MODEL = 'google/gemini-2.5-flash';
export const MAX_INPUT_PRICE_PER_TOKEN = 0.000001;
export const MAX_OUTPUT_PRICE_PER_TOKEN = 0.000005;
export const BLOCKED_MODEL_PATTERNS = [
  /embed/i,
  /imagen/i,
  /flux/i,
  /voyage/i,
  /vision/i,
  /-vl/i,
  /-image/i,
  /morph/i,
  /v0-/i,
];

export const HN_SQL_API = process.env.HN_SQL_API_URL || 'http://localhost:3123';
