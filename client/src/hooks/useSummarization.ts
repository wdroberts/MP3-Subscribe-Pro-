import { useState, useCallback } from 'react';
import { requestSummarization } from '../services/api.ts';
import { SummarizationResult } from '../types/index.ts';

interface UseSummarizationReturn {
  summarize: (transcriptionId: string) => Promise<void>;
  summary: SummarizationResult | null;
  isLoading: boolean;
  error: string | null;
}

export function useSummarization(): UseSummarizationReturn {
  const [summary, setSummary] = useState<SummarizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summarize = useCallback(async (transcriptionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await requestSummarization(transcriptionId);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summarization failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { summarize, summary, isLoading, error };
}
