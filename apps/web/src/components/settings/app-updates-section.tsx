"use client";

import type { CSSProperties } from "react";
import { Button } from "@intake/ui/button";
import { Smartphone, RefreshCw } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { useVersionCheck } from "@/hooks/use-version-check";
import { useToast } from "@intake/ui/use-toast";
import { isCapacitorMode } from "@/lib/api-fetch";
import { SubHead, btnClass, helpClass } from "@/components/settings/settings-kit";
import { domainColor } from "@/lib/domain-colors";

export function AppUpdatesSection() {
  const { toast } = useToast();
  const {
    isUpdateAvailable,
    isChecking,
    serverVersion,
    clientVersion,
    checkForUpdates,
    applyUpdate,
  } = useVersionCheck();

  const capacitor = isCapacitorMode();

  return (
    <div className="flex flex-col gap-2.5">
      <SubHead icon={Smartphone}>{capacitor ? "App Version" : "App Updates"}</SubHead>
      <div className="flex flex-col gap-2.5">
        {isUpdateAvailable ? (
          <div
            className="border border-water bg-background p-2.5"
            style={{ "--c": domainColor("water") } as CSSProperties}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-water">
                  Update available
                </p>
                <p className={`${helpClass} mt-0.5`}>
                  {capacitor
                    ? `v${serverVersion} available — update from Play Store`
                    : `v${serverVersion} available (you have v${clientVersion})`}
                </p>
              </div>
              {!capacitor && (
                <Button
                  className="shrink-0 bg-water text-on-domain hover:bg-water/90"
                  onClick={applyUpdate}
                >
                  <RefreshCw className="h-4 w-4" />
                  Update
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className={`${btnClass} w-full justify-start`}
            onClick={async () => {
              try {
                const hasUpdate = await checkForUpdates();
                if (hasUpdate) {
                  toast({
                    title: "Update available",
                    description: capacitor
                      ? "A new version is available on Play Store"
                      : "A new version is ready to install",
                  });
                } else {
                  toast({
                    title: "You're up to date",
                    description: `Running v${clientVersion}`,
                  });
                }
              } catch {
                toast({
                  title: "Check failed",
                  description: "Could not check for updates",
                  variant: "destructive",
                });
              }
            }}
            disabled={isChecking}
          >
            {isChecking ? (
              <>
                <Spinner className="size-4" />
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
        <p className={helpClass}>
          Running v{clientVersion} · Checks automatically every 5 min
        </p>
      </div>
    </div>
  );
}
