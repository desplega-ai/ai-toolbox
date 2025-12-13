// Default model when none selected
export const DEFAULT_MODEL = 'google/gemini-2.5-flash';

// Maximum messages to send in chat context
export const MAX_CONVERSATION_MESSAGES = 25;

// Maximum price per million tokens
// Input: $1/MTok = $0.000001 per token
// Output: $5/MTok = $0.000005 per token
export const MAX_INPUT_PRICE_PER_TOKEN = 0.000001;
export const MAX_OUTPUT_PRICE_PER_TOKEN = 0.000005;

// Blocked model patterns (even if marked as language) - image, vision, embedding models
export const BLOCKED_MODEL_PATTERNS = [
  /embed/i,
  /imagen/i,
  /flux/i,
  /voyage/i,
  /vision/i,
  /-vl/i,        // vision-language models like qwen3-vl
  /-image/i,    // image generation models
  /morph/i,     // morph image models
  /v0-/i,       // vercel v0 (UI generation)
];
