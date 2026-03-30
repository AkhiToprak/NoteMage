'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SearchResults, SearchContext } from '@/types/search';

export function useSearch(context: SearchContext, notebookId?: string) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(
    (q: string) => {
      if (abortRef.current) abortRef.current.abort();

      if (q.length < 2) {
        setResults(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;

      const params = new URLSearchParams({ q, context });
      if (notebookId) params.set('notebookId', notebookId);

      fetch(`/api/search?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json) => {
          if (json.success) setResults(json.data);
          setIsLoading(false);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setIsLoading(false);
        });
    },
    [context, notebookId],
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchResults(query), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, fetchResults]);

  const clearResults = useCallback(() => {
    setQuery('');
    setResults(null);
  }, []);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { query, setQuery, results, isLoading, clearResults };
}
