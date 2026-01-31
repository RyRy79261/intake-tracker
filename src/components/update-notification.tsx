"use client";

import { useServiceWorker } from "@/hooks/use-service-worker";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function UpdateNotification() {
  const { isUpdateAvailable, isUpdating, applyUpdate, dismissUpdate } = useServiceWorker();

  if (!isUpdateAvailable) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 z-50",
        "mx-auto max-w-md",
        "bg-sky-600 dark:bg-sky-700 text-white",
        "rounded-lg shadow-lg",
        "p-4",
        "animate-in slide-in-from-bottom-4 duration-300"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-full bg-white/20 shrink-0">
            <RefreshCw className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">Update available</p>
            <p className="text-xs text-sky-100 truncate">
              Tap to get the latest version
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-white hover:bg-white/20 hover:text-white"
            onClick={applyUpdate}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Updating...
              </>
            ) : (
              "Update"
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
            onClick={dismissUpdate}
            disabled={isUpdating}
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
