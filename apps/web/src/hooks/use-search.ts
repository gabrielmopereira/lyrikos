import { useEffect, useState } from "react";

import { searchTracks, type SearchTrack } from "@/lib/api";

const DEBOUNCE_MS = 600;

const useSearch = (query: string, limit = 10) => {
  const [results, setResults] = useState<Array<SearchTrack>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<Error | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const controller = new AbortController();

    const timer = setTimeout(
      async () => {
        if (!trimmed) {
          setResults([]);
          setIsLoading(false);
          setFetchError(null);
          return;
        }

        setIsLoading(true);
        setFetchError(null);

        try {
          const response = await searchTracks(trimmed, limit, { signal: controller.signal });

          if (controller.signal.aborted) {
            return;
          }

          setResults(response.data);
          setIsLoading(false);
        } catch (error: unknown) {
          if (controller.signal.aborted) {
            return;
          }

          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          setFetchError(error instanceof Error ? error : new Error(String(error)));
          setResults([]);
          setIsLoading(false);
        }
      },
      trimmed ? DEBOUNCE_MS : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, limit]);

  return { error: fetchError, isLoading, results };
};

export { useSearch };
