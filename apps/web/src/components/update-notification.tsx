"use client";

import { useVersionCheck } from "@/hooks/use-version-check";
import { isCapacitorMode } from "@/lib/api-fetch";
import { RefreshCw, X } from "lucide-react";

/**
 * "Update available" banner (the prototype's `.upd`): a flat water-coloured
 * strip pinned 10px above the bottom bar, full width on a phone and a 420px
 * block on the right on a wide screen. The bottom bar shows at every width
 * here (the prototype drops it on wide), so the banner always clears it and
 * never covers Log or Hold to talk. It sits above the window layer but below
 * the sys-bar, bottom bar and dialogs.
 */
export function UpdateNotification() {
  const { isUpdateAvailable, serverVersion, applyUpdate, dismissUpdate } = useVersionCheck();
  const capacitor = isCapacitorMode();

  if (!isUpdateAvailable) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-banner"
      className="fixed inset-x-3 bottom-[calc(56px+env(safe-area-inset-bottom,0px)+10px)] z-[45] flex min-h-14 items-center gap-2.5 bg-water py-1.5 pl-2.5 pr-1 text-on-domain md:left-auto md:right-4 md:w-[420px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-on-domain/18"
      >
        <RefreshCw className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm font-semibold leading-[1.25]">Update available</b>
        <small className="block text-xs leading-[1.3] opacity-90">
          <span className="num">v{serverVersion}</span>
          {capacitor
            ? " available — update from Play Store"
            : " is available — tap to refresh"}
        </small>
      </span>
      {!capacitor && (
        <button
          type="button"
          onClick={applyUpdate}
          className="min-h-11 shrink-0 px-3 text-sm font-semibold hover:bg-on-domain/16 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-on-domain"
        >
          Update
        </button>
      )}
      <button
        type="button"
        onClick={dismissUpdate}
        aria-label="Dismiss"
        className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-on-domain/16 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-on-domain"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  );
}
