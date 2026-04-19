"use client";

import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useSession } from "@/lib/auth-client";
import { usePathname } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

export function SyncErrorBanner() {
  const lastError = useSyncStatusStore((s) => s.lastError);
  const { data: session } = useSession();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  if (!lastError || dismissed || !session?.user || pathname?.startsWith("/auth")) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive shadow-lg backdrop-blur-sm dark:border-destructive/20 dark:bg-destructive/20">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Sync failed</p>
          <p className="mt-0.5 text-xs opacity-80 break-words">{lastError}</p>
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
