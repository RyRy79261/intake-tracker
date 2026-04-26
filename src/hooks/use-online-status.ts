"use client";

import { useEffect, useState } from "react";

/**
 * Reactive `navigator.onLine` flag. Subscribes to "online" / "offline" events
 * so consumers re-render when connectivity changes.
 *
 * Caveat: `navigator.onLine === true` only means the radio is up — it does
 * NOT guarantee internet reachability (captive portals, dead Wi-Fi, etc).
 * Use this to short-circuit obviously-impossible network calls and to drive
 * UI affordances; do not use it as proof that a fetch will succeed.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine !== false);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
