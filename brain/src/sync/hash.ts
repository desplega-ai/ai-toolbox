/**
 * Compute SHA-256 hash of content
 * Uses Bun's built-in crypto
 */
export async function hashContent(content: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex");
}
