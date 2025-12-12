import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { SchemaResponse } from '@/types/api';

export function useSchema() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.schema()
      .then(setSchema)
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  return { schema, error, isLoading };
}
