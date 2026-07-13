import { useEffect, useState } from 'react';

/**
 * Live "current time" hook. Returns a Date that refreshes every `intervalMs`
 * (default 60s) so time-derived UI  the status-bar clock, the greeting, the
 * date label  stays in sync with the real clock and rolls over on its own
 * (morning → afternoon → evening, and across midnight).
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
