"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@intake/ui/button";
import { Cog, RefreshCw, BellRing } from "lucide-react";
import { useToast } from "@intake/ui/use-toast";

interface SWState {
  supported: boolean;
  registered: boolean;
  scope?: string | undefined;
  scriptURL?: string | undefined;
  controllerScriptURL?: string | undefined;
  activeState?: string | undefined;
  waitingState?: string | undefined;
  installingState?: string | undefined;
  cacheNames: string[];
}

interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  endpoint?: string | undefined;
}

const INITIAL_SW: SWState = {
  supported: false,
  registered: false,
  cacheNames: [],
};

const INITIAL_PUSH: PushState = {
  supported: false,
  permission: "unsupported",
  subscribed: false,
};

async function readSWState(): Promise<SWState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return INITIAL_SW;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  let cacheNames: string[] = [];
  if ("caches" in window) {
    try {
      cacheNames = await caches.keys();
    } catch {
      cacheNames = [];
    }
  }
  if (!reg) {
    return { supported: true, registered: false, cacheNames };
  }
  return {
    supported: true,
    registered: true,
    scope: reg.scope,
    scriptURL: reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL,
    controllerScriptURL: navigator.serviceWorker.controller?.scriptURL,
    activeState: reg.active?.state,
    waitingState: reg.waiting?.state,
    installingState: reg.installing?.state,
    cacheNames,
  };
}

async function readPushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return INITIAL_PUSH;
  }
  const permission = Notification.permission;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { supported: false, permission, subscribed: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { supported: true, permission, subscribed: false };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { supported: true, permission, subscribed: false };
    return {
      supported: true,
      permission,
      subscribed: true,
      endpoint: sub.endpoint,
    };
  } catch {
    return { supported: true, permission, subscribed: false };
  }
}

export function ServiceWorkerDiagnostics() {
  const { toast } = useToast();
  const [sw, setSw] = useState<SWState>(INITIAL_SW);
  const [push, setPush] = useState<PushState>(INITIAL_PUSH);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [s, p] = await Promise.all([readSWState(), readPushState()]);
      setSw(s);
      setPush(p);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpdate = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast({ title: "No service worker registered" });
        return;
      }
      await reg.update();
      toast({ title: "Update check requested" });
      await refresh();
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);

  const handleSkipWaiting = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        toast({ title: "SKIP_WAITING posted to waiting worker" });
      } else {
        toast({ title: "No waiting worker" });
      }
    } catch (e) {
      toast({
        title: "Skip waiting failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleUnregister = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setBusy(true);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
      toast({
        title: "Service workers unregistered",
        description: `${regs.length} registration(s) removed`,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);

  const handleClearCaches = useCallback(async () => {
    if (!("caches" in window)) return;
    setBusy(true);
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      toast({
        title: "Caches cleared",
        description: `${names.length} cache(s) deleted`,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);

  const handleTestNotification = useCallback(async () => {
    try {
      const mod = await import("@/lib/push-notification-service");
      const ok = await mod.sendTestNotification();
      toast({
        title: ok ? "Test notification sent" : "Notification failed",
        description: ok ? undefined : "Check permission and service worker",
        variant: ok ? undefined : "destructive",
      });
    } catch (e) {
      toast({
        title: "Notification failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [toast]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Cog className="h-4 w-4" />
          Service Worker & Push
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw
            className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <Row label="Supported" value={sw.supported ? "yes" : "no"} />
      <Row label="Registered" value={sw.registered ? "yes" : "no"} />
      {sw.scope && <Row label="Scope" value={sw.scope} />}
      {sw.scriptURL && <Row label="Script URL" value={sw.scriptURL} />}
      {sw.controllerScriptURL && (
        <Row label="Controller" value={sw.controllerScriptURL} />
      )}
      {sw.activeState && <Row label="Active state" value={sw.activeState} />}
      {sw.waitingState && (
        <Row label="Waiting state" value={sw.waitingState} />
      )}
      {sw.installingState && (
        <Row label="Installing state" value={sw.installingState} />
      )}
      <Row
        label="Caches"
        value={sw.cacheNames.length === 0 ? "none" : sw.cacheNames.join(", ")}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleUpdate}
          disabled={busy || !sw.registered}
        >
          Force update check
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleSkipWaiting}
          disabled={busy || !sw.waitingState}
        >
          Skip waiting
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleClearCaches}
          disabled={busy || sw.cacheNames.length === 0}
        >
          Clear caches
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs text-red-600 dark:text-red-400"
          onClick={handleUnregister}
          disabled={busy || !sw.registered}
        >
          Unregister
        </Button>
      </div>

      <div className="border-t pt-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BellRing className="h-4 w-4" />
          Push
        </div>
        <Row label="Push supported" value={push.supported ? "yes" : "no"} />
        <Row label="Permission" value={push.permission} />
        <Row label="Subscribed" value={push.subscribed ? "yes" : "no"} />
        {push.endpoint && <Row label="Endpoint" value={push.endpoint} />}
        <div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs mt-2"
            onClick={handleTestNotification}
            disabled={push.permission !== "granted"}
          >
            Send test notification
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="font-mono break-all flex-1">{value}</span>
    </div>
  );
}
