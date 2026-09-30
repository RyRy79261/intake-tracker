"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { Button } from "@intake/ui/button";
import { useToast } from "@intake/ui/use-toast";
import {
  createPreviewDatabase,
  resetActiveDatabase,
  setActiveDatabase,
  type AppDatabase,
} from "@/lib/db";
import { resumeEngine, suspendEngine, waitForSyncIdle } from "@/lib/sync-engine";
import {
  InPreviewProvider,
  PreviewSafeZone,
  onOutsideInteraction,
} from "@/components/help/preview-scope";

type Status = "loading" | "ready" | "paused" | "error";

/**
 * Renders a real app component live inside the manual, against a throwaway,
 * fixture-seeded database. While a preview is mounted the active database is
 * swapped (see `setActiveDatabase`) and the sync engine is suspended, so the
 * component is fully interactive but completely isolated from the user's real
 * data — nothing it reads or writes leaves the preview.
 *
 * The rest of the app stays mounted behind the manual (Home, other windows),
 * so the swap is kept away from it three ways:
 * - the preview renders with its own QueryClient; the app-wide client holds
 *   every fetch until the real database is back (`whenRealDatabase`);
 * - releasing the preview re-runs any live query that read the sample data;
 * - using anything outside the manual pauses the preview first, handing the
 *   real database back before that action runs (`onOutsideInteraction`).
 */
export function ComponentPreview({
  seed,
  children,
}: {
  seed: (database: AppDatabase) => Promise<void>;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [generation, setGeneration] = useState(0);
  const { dismiss } = useToast();
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  });

  const queryClientRef = useRef<QueryClient | null>(null);
  if (queryClientRef.current === null) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, networkMode: "always" },
        mutations: { retry: false, networkMode: "always" },
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    let released = false;
    let stopGuard = () => {};
    let swapped = false;
    const preview = createPreviewDatabase();
    suspendEngine();

    const release = () => {
      if (released) return;
      released = true;
      stopGuard();
      if (swapped) resetActiveDatabase();
      resumeEngine();
      // A demo toast's Undo would act on the real database from here on.
      dismissRef.current();
      queryClientRef.current?.clear();
      void preview.delete().catch(() => {});
    };

    stopGuard = onOutsideInteraction(() => {
      cancelled = true;
      release();
      setStatus("paused");
    });

    void (async () => {
      try {
        // Suspending only stops new sync cycles. One already in flight reads
        // `db` again after its network round trip, and would then apply the
        // user's pulled rows and push acks to the sample database: let it
        // finish on the real one before swapping.
        await waitForSyncIdle();
        if (released) return;
        setActiveDatabase(preview);
        swapped = true;
        await preview.open();
        await seed(preview);
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      release();
    };
  }, [seed, generation]);

  const restart = () => {
    setStatus("loading");
    setGeneration((g) => g + 1);
  };

  return (
    <PreviewSafeZone className="border border-line bg-background">
      <section aria-label="Live preview" data-testid="manual-demo" data-status={status}>
        <div className="flex items-center justify-between gap-2 border-b border-line py-1.5 pl-2.5 pr-1.5 text-xs text-muted-foreground">
          <span>Live preview · sample data · not saved</span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={restart}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </Button>
        </div>
        <div className="p-2.5">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Preparing preview…
            </div>
          )}
          {status === "error" && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              The preview could not be loaded.
            </p>
          )}
          {status === "paused" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="max-w-[30ch] text-sm text-muted-foreground">
                The preview paused while you used the rest of the app. Your own
                data was not touched.
              </p>
              <Button variant="outline" size="sm" onClick={restart}>
                Resume preview
              </Button>
            </div>
          )}
          {status === "ready" && (
            <QueryClientProvider client={queryClientRef.current}>
              <InPreviewProvider value>
                <div key={generation}>{children}</div>
              </InPreviewProvider>
            </QueryClientProvider>
          )}
        </div>
      </section>
    </PreviewSafeZone>
  );
}
