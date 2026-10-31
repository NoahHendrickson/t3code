import { useEffect, useState } from "react";

/**
 * Re-renders on an interval so relative labels ("in 3m", "2h ago") stay current.
 * Upstream's settings layout used to export this; the Automations page keeps
 * its own copy now that upstream's pages derive their clocks differently.
 */
export function useRelativeTimeTick(intervalMs = 1_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- ticks the clock the relative labels read from
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}
