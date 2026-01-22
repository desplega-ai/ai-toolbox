/**
 * Embedding provider interface
 * Allows for different embedding backends (OpenAI, Ollama, etc.)
 */
export interface EmbeddingProvider {
  /** Provider/model name */
  name: string;
  /** Embedding vector dimensions */
  dimensions: number;

  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch)
   * More efficient than calling embed() multiple times
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}
