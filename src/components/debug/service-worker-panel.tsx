"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Download,
  Power,
} from "lucide-react";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { useOnlineStatus } from "@/hooks/use-online-status";

interface CacheEntry {
  name: string;
  size: number;
}

const BYPASS_KEY = "intake-tracker-bypass-auth";
const REMEMBERED_AUTH_KEY = "intake-tracker-last-auth";

function formatTimestamp(ts: number | null): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleString();
}

export function ServiceWorkerPanel() {
  const {
    isRegistered,
    registrationError,
    registration,
    isUpdateAvailable,
    isUpdating,
    registerServiceWorker,
    unregisterServiceWorker,
    forceSkipWaiting,
    checkForUpdates,
    applyUpdate,
  } = useServiceWorker();
  const isOnline = useOnlineStatus();

  const [caches, setCaches] = useState<CacheEntry[]>([]);
  const [activeWorkerState, setActiveWorkerState] = useState<string>("none");
  const [waitingWorkerState, setWaitingWorkerState] = useState<string>("none");
  const [scope, setScope] = useState<string>("");
  const [scriptUrl, setScriptUrl] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    kind: "info" | "success" | "error";
    message: string;
  } | null>(null);
  const [bypassActive, setBypassActive] = useState(false);
  const [rememberedAuth, setRememberedAuth] = useState<number | null>(null);

  const refreshCacheList = useCallback(async () => {
    if (typeof window === "undefined" || !("caches" in window)) {
      setCaches([]);
      return;
    }
    try {
      const names = await window.caches.keys();
      const entries: CacheEntry[] = [];
      for (const name of names) {
        try {
          const cache = await window.caches.open(name);
          const keys = await cache.keys();
          entries.push({ name, size: keys.length });
        } catch {
          entries.push({ name, size: 0 });
        }
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      setCaches(entries);
    } catch {
      setCaches([]);
    }
  }, []);

  const refreshRegistration = useCallback(async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      setActiveWorkerState(reg?.active?.state ?? "none");
      setWaitingWorkerState(reg?.waiting?.state ?? "none");
      setScope(reg?.scope ?? "");
      setScriptUrl(reg?.active?.scriptURL ?? reg?.installing?.scriptURL ?? "");
    } catch {
      setActiveWorkerState("error");
      setWaitingWorkerState("error");
    }
  }, []);

  const refreshAuthState = useCallback(() => {
    if (typeof window === "undefined") return;
    const bypass = window.localStorage.getItem(BYPASS_KEY);
    setBypassActive(!!bypass);
    const remembered = window.localStorage.getItem(REMEMBERED_AUTH_KEY);
    const ts = remembered ? Number(remembered) : NaN;
    setRememberedAuth(Number.isFinite(ts) ? ts : null);
  }, []);

  useEffect(() => {
    refreshCacheList();
    refreshRegistration();
    refreshAuthState();
  }, [refreshCacheList, refreshRegistration, refreshAuthState, registration, isRegistered]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<{ success: boolean; message: string }>) => {
      setBusyAction(key);
      setLastResult(null);
      try {
        const result = await fn();
        setLastResult({
          kind: result.success ? "success" : "error",
          message: result.message,
        });
      } catch (e) {
        setLastResult({
          kind: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        setBusyAction(null);
        await refreshCacheList();
        await refreshRegistration();
        refreshAuthState();
      }
    },
    [refreshCacheList, refreshRegistration, refreshAuthState],
  );

  const handleRegister = () =>
    runAction("register", async () => {
      const result = await registerServiceWorker();
      return {
        success: result.success,
        message: result.success
          ? "Service worker registered."
          : `Registration failed: ${result.error ?? "unknown"}`,
      };
    });

  const handleUnregister = () =>
    runAction("unregister", async () => {
      const ok = await unregisterServiceWorker();
      return {
        success: ok,
        message: ok
          ? "Service worker unregistered. Reload the page to take effect."
          : "Failed to unregister service worker.",
      };
    });

  const handleCheck = () =>
    runAction("check", async () => {
      const found = await checkForUpdates();
      return {
        success: true,
        message: found
          ? "Update available — use 'Apply update' to install."
          : "No update available — already on the latest service worker.",
      };
    });

  const handleApplyUpdate = () =>
    runAction("apply-update", async () => {
      await applyUpdate();
      return {
        success: true,
        message: "Update applied. The page will reload when the new worker takes control.",
      };
    });

  const handleSkipWaiting = () =>
    runAction("skip-waiting", async () => {
      const ok = await forceSkipWaiting();
      return {
        success: ok,
        message: ok
          ? "Skip-waiting message sent. The waiting worker will activate."
          : "No waiting worker to activate.",
      };
    });

  const handleClearCaches = () =>
    runAction("clear-caches", async () => {
      if (typeof window === "undefined" || !("caches" in window)) {
        return { success: false, message: "Cache API not available." };
      }
      const names = await window.caches.keys();
      let cleared = 0;
      for (const name of names) {
        const ok = await window.caches.delete(name);
        if (ok) cleared++;
      }
      return {
        success: true,
        message: `Cleared ${cleared} cache${cleared === 1 ? "" : "s"}.`,
      };
    });

  const handleNuke = () =>
    runAction("nuke", async () => {
      let unregistered = 0;
      let cleared = 0;
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (await reg.unregister()) unregistered++;
        }
      }
      if (typeof window !== "undefined" && "caches" in window) {
        const names = await window.caches.keys();
        for (const name of names) {
          if (await window.caches.delete(name)) cleared++;
        }
      }
      return {
        success: true,
        message: `Unregistered ${unregistered} worker${unregistered === 1 ? "" : "s"}, cleared ${cleared} cache${cleared === 1 ? "" : "s"}. Reload to start fresh.`,
      };
    });

  const handleActivateBypass = () =>
    runAction("activate-bypass", async () => {
      window.localStorage.setItem(BYPASS_KEY, String(Date.now()));
      return {
        success: true,
        message: "Auth bypass activated for 18 days.",
      };
    });

  const handleClearBypass = () =>
    runAction("clear-bypass", async () => {
      window.localStorage.removeItem(BYPASS_KEY);
      return {
        success: true,
        message: "Auth bypass cleared.",
      };
    });

  const swSupported =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const cacheSupported = typeof window !== "undefined" && "caches" in window;
  const totalCacheEntries = caches.reduce((acc, c) => acc + c.size, 0);

  return (
    <div className="space-y-3">
      {/* Status overview */}
      <Card className="p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">Status</span>
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Wifi className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Online
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                Offline
              </Badge>
            )}
            {!swSupported ? (
              <Badge variant="destructive" className="text-[10px]">
                Not supported
              </Badge>
            ) : isRegistered ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Registered
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <XCircle className="h-3 w-3 text-muted-foreground" />
                Not registered
              </Badge>
            )}
            {isUpdateAvailable && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Download className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                Update ready
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
          <span className="text-muted-foreground">Active worker:</span>
          <span>{activeWorkerState}</span>
          <span className="text-muted-foreground">Waiting worker:</span>
          <span>{waitingWorkerState}</span>
          <span className="text-muted-foreground">Scope:</span>
          <span className="truncate">{scope || "—"}</span>
          <span className="text-muted-foreground">Script:</span>
          <span className="truncate">
            {scriptUrl ? scriptUrl.replace(window.location.origin, "") : "—"}
          </span>
          <span className="text-muted-foreground">Caches:</span>
          <span>
            {caches.length} ({totalCacheEntries} entries)
          </span>
        </div>

        {registrationError && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{registrationError}</span>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Worker
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleRegister}
            disabled={busyAction !== null || !swSupported}
          >
            <Power className="h-3 w-3 mr-1" />
            {isRegistered ? "Re-register" : "Register"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleUnregister}
            disabled={busyAction !== null || !swSupported || !isRegistered}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Unregister
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleCheck}
            disabled={busyAction !== null || !swSupported || !isRegistered}
          >
            <RefreshCw
              className={`h-3 w-3 mr-1 ${busyAction === "check" ? "animate-spin" : ""}`}
            />
            Check for update
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleApplyUpdate}
            disabled={busyAction !== null || !isUpdateAvailable || isUpdating}
          >
            <Download className="h-3 w-3 mr-1" />
            Apply update
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleSkipWaiting}
            disabled={busyAction !== null || waitingWorkerState === "none"}
          >
            Skip waiting
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Caches
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={refreshCacheList}
            disabled={busyAction !== null || !cacheSupported}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh list
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleClearCaches}
            disabled={busyAction !== null || !cacheSupported || caches.length === 0}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear all caches
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            onClick={handleNuke}
            disabled={busyAction !== null || !swSupported}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Nuke (unregister + clear)
          </Button>
        </div>
        {caches.length > 0 && (
          <Card className="p-3 text-[11px] font-mono space-y-1">
            {caches.map((c) => (
              <div key={c.name} className="flex justify-between gap-2">
                <span className="truncate" title={c.name}>{c.name}</span>
                <span className="text-muted-foreground shrink-0">{c.size} entries</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Auth (offline mode)
        </div>
        <Card className="p-3 text-[11px] space-y-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-muted-foreground">Bypass active:</span>
            <span>{bypassActive ? "yes" : "no"}</span>
            <span className="text-muted-foreground">Last Privy login:</span>
            <span>{formatTimestamp(rememberedAuth)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={handleActivateBypass}
              disabled={busyAction !== null}
            >
              Activate bypass (18 days)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={handleClearBypass}
              disabled={busyAction !== null || !bypassActive}
            >
              Clear bypass
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            The bypass code grants 18 days of offline access. The bootstrap
            activates it automatically when the device is offline so the
            sign-in screen never traps the user.
          </p>
        </Card>
      </div>

      {lastResult && (
        <Card
          className={`p-2.5 text-[11px] ${
            lastResult.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : lastResult.kind === "error"
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                : ""
          }`}
        >
          {lastResult.message}
        </Card>
      )}
    </div>
  );
}
