"use client";

import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/error-boundary";
import { initStockRecalculation } from "@/lib/inventory-service";
import { useTimezoneDetection } from "@/hooks/use-timezone-detection";
import { TimezoneChangeDialog } from "@/components/medications/timezone-change-dialog";

/**
 * Simplified provider stack (D-27). Privy wrappers and the PIN gate
 * provider are all removed — Neon Auth's client is stateless at the
 * React level (useSession manages its own fetch/cache) and PIN gating
 * is being retired in plan 41-04. The root middleware.ts handles all
 * unauthenticated redirects, so no provider-level gating is needed.
 */

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

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
  const queryClient = getQueryClient();

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
          <TimezoneGuard>{children}</TimezoneGuard>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
