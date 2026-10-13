import { useState } from 'react';

/**
 * Back to page 0 whenever `key` (the serialized filters) changes. Done during render, React's
 * "adjust state when a prop changes" pattern, rather than in an effect, so the fetch effect never
 * runs once with the stale page first.
 */
export const useResetPage = (key: string, setPage: (page: number) => void) => {
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setPage(0);
  }
};
