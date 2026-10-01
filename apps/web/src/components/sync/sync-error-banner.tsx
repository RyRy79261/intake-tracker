"use client";

import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useAuth } from "@/components/auth-guard";
import { usePathname } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { isChromeRoute, isWindowRoute } from "@/lib/nav-routes";
import { cn } from "@/lib/utils";

export function SyncErrorBanner() {
  const lastError = useSyncStatusStore((s) => s.lastError);
  const { authenticated } = useAuth();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  if (!lastError || dismissed || !authenticated || pathname?.startsWith("/auth")) return null;

  // The shell's bottom bar (Home, Windows, Hold to talk, Log) is fixed to the
  // bottom edge at the same z-index: sit above it, not on it.
  const overBar = isChromeRoute(pathname) || isWindowRoute(pathname);

  return (
    <div
      data-testid="sync-error-banner"
      className={cn(
        "fixed left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300",
        overBar ? "bottom-[calc(var(--bbh,56px)+env(safe-area-inset-bottom,0px)+16px)]" : "bottom-4",
      )}
    >
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive shadow-lg backdrop-blur-xs dark:border-destructive/20 dark:bg-destructive/20">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Sync failed</p>
          <p className="mt-0.5 text-xs opacity-80 wrap-break-word">{lastError}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 hover:bg-destructive/10"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </button>
      </div>
    </div>
  );
}
