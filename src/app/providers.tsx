"use client";

import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/error-boundary";
import { initStockRecalculation } from "@/lib/inventory-service";
import { useTimezoneDetection } from "@/hooks/use-timezone-detection";
import { TimezoneChangeDialog } from "@/components/medications/timezone-change-dialog";
import { queryClient } from "@/lib/query-client";
import { SyncLifecycleMount } from "@/components/sync/sync-lifecycle-mount";
import { SyncErrorBanner } from "@/components/sync/sync-error-banner";
import { MigrationGuard } from "@/components/migration/migration-guard";

/**
 * Simplified provider stack (D-27). Privy wrappers and the PIN gate
 * provider are all removed — Neon Auth's client is stateless at the
 * React level (useSession manages its own fetch/cache) and PIN gating
 * is being retired in plan 41-04. The root middleware.ts handles all
 * unauthenticated redirects, so no provider-level gating is needed.
 */


function TimezoneGuard({ children }: { children: React.ReactNode }) {
  const {
    dialogOpen,
    oldTimezone,
    newTimezone,
    isRecalculating,
    handleConfirm,
    handleDismiss,
  } = useTimezoneDetection();

  return (
    <>
      {children}
      <TimezoneChangeDialog
        open={dialogOpen}
        oldTimezone={oldTimezone}
        newTimezone={newTimezone}
        isRecalculating={isRecalculating}
        onConfirm={handleConfirm}
        onDismiss={handleDismiss}
      />
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Recalculate stock on app launch (fire-and-forget)
  const stockInitRef = useRef(false);
  useEffect(() => {
    if (!stockInitRef.current) {
      stockInitRef.current = true;
      initStockRecalculation();
    }
  }, []);

  // Unregister stale service workers on non-production deploys to prevent
  // Workbox from serving cached JS/HTML that masks new code.
  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
    if (env && env !== "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister();
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TimezoneGuard>
            {children}
            <SyncLifecycleMount />
            <SyncErrorBanner />
            <MigrationGuard />
          </TimezoneGuard>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
