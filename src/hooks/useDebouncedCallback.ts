import { useEffect, useRef } from "react";

/** Returns a debounced version of `callback` that always calls the latest closure. */
export function useDebouncedCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  delayMs: number
) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function debounced(...args: Args) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      void callbackRef.current(...args);
    }, delayMs);
  }

  function flushNow(...args: Args) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    return callbackRef.current(...args);
  }

  return { debounced, flushNow };
}
