import { useState, useEffect, useMemo } from 'react';
import type { Model } from '@/types/api';

const MODELS_CACHE_KEY = 'ai-gateway:models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedModels {
  models: Model[];
  timestamp: number;
}

export function useAvailableModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      // Check cache first
      const cached = localStorage.getItem(MODELS_CACHE_KEY);
      if (cached) {
        try {
          const { models, timestamp }: CachedModels = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL_MS) {
            setModels(models);
            setLoading(false);
            return;
          }
        } catch {
          // Invalid cache, fetch fresh
        }
      }

      try {
        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }

        const data = await response.json();
        setModels(data.models);

        // Cache for 1 hour
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({
          models: data.models,
          timestamp: Date.now(),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
        // Fall back to cached models if available
        if (cached) {
          try {
            setModels(JSON.parse(cached).models);
          } catch {
            // Ignore parse error
          }
        }
      } finally {
        setLoading(false);
      }
    }

    fetchModels();
  }, []);

  // Group models by provider for UI
  const modelsByProvider = useMemo(() => {
    return models.reduce((acc, model) => {
      const provider = model.provider;
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, Model[]>);
  }, [models]);

  return { models, modelsByProvider, loading, error };
}
