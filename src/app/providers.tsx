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

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TimezoneGuard>
            {children}
            <SyncLifecycleMount />
          </TimezoneGuard>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
