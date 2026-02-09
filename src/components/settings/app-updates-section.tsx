"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, RefreshCw, Loader2 } from "lucide-react";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { useToast } from "@/hooks/use-toast";

export function AppUpdatesSection() {
  const { toast } = useToast();
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const { isUpdateAvailable, applyUpdate, checkForUpdates, isUpdating } = useServiceWorker();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <Smartphone className="w-4 h-4" />
        <h3 className="font-semibold">App Updates</h3>
      </div>
      <div className="space-y-3 pl-0">
        {isUpdateAvailable ? (
          <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
                  Update available
                </p>
                <p className="text-xs text-sky-600 dark:text-sky-500 mt-0.5">
                  A new version is ready to install
                </p>
              </div>
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                onClick={applyUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Update
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={async () => {
              setIsCheckingUpdates(true);
              try {
                const hasUpdate = await checkForUpdates();
                if (hasUpdate) {
                  toast({
                    title: "Update available",
                    description: "A new version is ready to install",
                  });
                } else {
                  toast({
                    title: "You're up to date",
                    description: "You have the latest version",
                  });
                }
              } catch {
                toast({
                  title: "Check failed",
                  description: "Could not check for updates",
                  variant: "destructive",
                });
              } finally {
                setIsCheckingUpdates(false);
              }
            }}
            disabled={isCheckingUpdates}
          >
            {isCheckingUpdates ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Check for Updates
              </>
            )}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Installed as PWA · Updates are checked automatically
        </p>
      </div>
    </div>
  );
}
