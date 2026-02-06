/**
 * useFetch - Generic data fetching hook with loading, error, and refetch support
 * 
 * Reduces code duplication across components by centralizing fetch logic
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseFetchOptions {
  /** Skip initial fetch on mount */
  skip?: boolean;
  /** Dependencies array for refetch triggers */
  deps?: any[];
  /** Callback on successful fetch */
  onSuccess?: (data: any) => void;
  /** Callback on fetch error */
  onError?: (error: string) => void;
}

interface UseFetchReturn<T> extends FetchState<T> {
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Set data manually (useful for optimistic updates) */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Generic data fetching hook
 * 
 * @example
 * const { data, loading, error, refetch } = useFetch(
 *   () => purchaseApi.getBills(page, limit),
 *   { deps: [page, limit] }
 * );
 */
export function useFetch<T>(
  fetchFn: () => Promise<{ data?: T; error?: string }>,
  options: UseFetchOptions = {}
): UseFetchReturn<T> {
  const { skip = false, deps = [], onSuccess, onError } = options;

  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: !skip,
    error: null,
  });

  // Use ref to track if component is mounted
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await fetchFn();

      if (!isMounted.current) return;

      if (result.error) {
        setState(prev => ({ ...prev, loading: false, error: result.error || 'Unknown error' }));
        onError?.(result.error);
      } else {
        setState({ data: result.data || null, loading: false, error: null });
        onSuccess?.(result.data);
      }
    } catch (err) {
      if (!isMounted.current) return;

      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      onError?.(errorMessage);
    }
  }, [fetchFn, onSuccess, onError]);

  useEffect(() => {
    isMounted.current = true;

    if (!skip) {
      fetchData();
    }

    return () => {
      isMounted.current = false;
    };
  }, [...deps, skip]);

  const setData = useCallback((value: React.SetStateAction<T | null>) => {
    setState(prev => ({
      ...prev,
      data: typeof value === 'function' ? (value as Function)(prev.data) : value,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    refetch: fetchData,
    setData,
    clearError,
  };
}

/**
 * Fetch multiple APIs in parallel
 * 
 * @example
 * const { data, loading, error, refetch } = useMultiFetch({
 *   bills: () => purchaseApi.getBills(),
 *   suppliers: () => mastersApi.getSuppliers(),
 *   materials: () => mastersApi.getRawMaterials(),
 * });
 */
export function useMultiFetch<T extends Record<string, () => Promise<{ data?: any; error?: string }>>>(
  fetchFns: T,
  options: Omit<UseFetchOptions, 'onSuccess'> & { onSuccess?: (data: { [K in keyof T]: any }) => void } = {}
): UseFetchReturn<{ [K in keyof T]: any }> {
  const { skip = false, deps = [], onSuccess, onError } = options;

  type ResultType = { [K in keyof T]: any };

  const [state, setState] = useState<FetchState<ResultType>>({
    data: null,
    loading: !skip,
    error: null,
  });

  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const keys = Object.keys(fetchFns) as (keyof T)[];
      const promises = keys.map(key => fetchFns[key]());
      const results = await Promise.all(promises);

      if (!isMounted.current) return;

      const errors: string[] = [];
      const data = {} as ResultType;

      keys.forEach((key, index) => {
        const result = results[index];
        if (result.error) {
          errors.push(`${String(key)}: ${result.error}`);
        } else {
          data[key] = result.data;
        }
      });

      if (errors.length > 0) {
        setState(prev => ({ ...prev, loading: false, error: errors.join('; ') }));
        onError?.(errors.join('; '));
      } else {
        setState({ data, loading: false, error: null });
        onSuccess?.(data);
      }
    } catch (err) {
      if (!isMounted.current) return;

      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      onError?.(errorMessage);
    }
  }, [fetchFns, onSuccess, onError]);

  useEffect(() => {
    isMounted.current = true;

    if (!skip) {
      fetchData();
    }

    return () => {
      isMounted.current = false;
    };
  }, [...deps, skip]);

  const setData = useCallback((value: React.SetStateAction<ResultType | null>) => {
    setState(prev => ({
      ...prev,
      data: typeof value === 'function' ? (value as Function)(prev.data) : value,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    refetch: fetchData,
    setData,
    clearError,
  };
}

export default useFetch;
