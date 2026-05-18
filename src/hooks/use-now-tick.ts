"use client";

import { useEffect, useState } from "react";

const subscribers = new Map<number, Set<() => void>>();
const timers = new Map<number, ReturnType<typeof setInterval>>();

function subscribe(intervalMs: number, fn: () => void): () => void {
  let set = subscribers.get(intervalMs);
  if (!set) {
    set = new Set();
    subscribers.set(intervalMs, set);
  }
  set.add(fn);

  if (!timers.has(intervalMs)) {
    const timer = setInterval(() => {
      subscribers.get(intervalMs)?.forEach((cb) => cb());
    }, intervalMs);
    timers.set(intervalMs, timer);
  }

  return () => {
    const s = subscribers.get(intervalMs);
    s?.delete(fn);
    if (s && s.size === 0) {
      const timer = timers.get(intervalMs);
      if (timer) clearInterval(timer);
      timers.delete(intervalMs);
      subscribers.delete(intervalMs);
    }
  };
}

export function useNowTick(intervalMs: number = 60_000): number {
  const safeIntervalMs =
    Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60_000;
  const [tick, setTick] = useState(0);
  useEffect(
    () => subscribe(safeIntervalMs, () => setTick((t) => t + 1)),
    [safeIntervalMs],
  );
  return tick;
}
