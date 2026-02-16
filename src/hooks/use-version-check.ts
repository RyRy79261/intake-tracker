"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface VersionCheckState {
  isUpdateAvailable: boolean;
  isChecking: boolean;
  serverVersion: string | null;
  lastChecked: number | null;
}

export function useVersionCheck() {
  const [state, setState] = useState<VersionCheckState>({
    isUpdateAvailable: false,
    isChecking: false,
    serverVersion: null,
    lastChecked: null,
  });
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isChecking: true }));
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return false;

      const data = await res.json();
      const serverVersion: string = data.version || "0.0.0";
      const hasUpdate = serverVersion !== CLIENT_VERSION;

      setState({
        isUpdateAvailable: hasUpdate,
        isChecking: false,
        serverVersion,
        lastChecked: Date.now(),
      });
      if (hasUpdate) setDismissed(false);
      return hasUpdate;
    } catch (error) {
      console.error("[VersionCheck] Failed to check for updates:", error);
      setState((prev) => ({ ...prev, isChecking: false }));
      return false;
    }
  }, []);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  const dismissUpdate = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    // Initial check after a short delay to avoid blocking page load
    const timeout = setTimeout(() => {
      checkForUpdates();
    }, 3000);

    // Periodic checks
    intervalRef.current = setInterval(() => {
      checkForUpdates();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkForUpdates]);

  return {
    isUpdateAvailable: state.isUpdateAvailable && !dismissed,
    isChecking: state.isChecking,
    serverVersion: state.serverVersion,
    clientVersion: CLIENT_VERSION,
    lastChecked: state.lastChecked,
    checkForUpdates,
    applyUpdate,
    dismissUpdate,
  };
}
