import { useEffect, useState } from 'react';

/** The current time, refreshed every `ms` — for time-based UI like "check-in opens in 5 min". */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
