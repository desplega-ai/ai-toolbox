import OpenAI from "openai";
import type { EmbeddingProvider } from "./types.ts";

/**
 * OpenAI embedding provider using text-embedding-3-small
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = "text-embedding-3-small";
  dimensions = 1536;

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI();
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.name,
      input: text,
    });

    const data = response.data[0];
    if (!data) {
      throw new Error("No embedding returned from OpenAI");
    }

    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // OpenAI supports up to 2048 inputs per request
    const batchSize = 2048;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: this.name,
        input: batch,
      });

      for (const item of response.data) {
        results.push(item.embedding);
      }
    }

    return results;
  }
}

// Singleton instance
let provider: EmbeddingProvider | null = null;

/**
 * Get the embedding provider singleton
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required for embeddings");
    }
    provider = new OpenAIEmbeddingProvider();
  }
  return provider;
}

/**
 * Check if embeddings are available (API key is set)
 */
export function isEmbeddingAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
