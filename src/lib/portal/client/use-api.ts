"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./api";

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Fetches again, keeping the current data on screen until the new data arrives. */
  reload: () => void;
  setData: (next: T) => void;
}

/** Loads a portal endpoint when the component mounts and whenever the path changes. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, "unknown", "Something went wrong. Try again."),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { data, error, loading, reload, setData };
}
