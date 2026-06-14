"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlaskConical, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@intake/ui/button";
import {
  createPreviewDatabase,
  resetActiveDatabase,
  setActiveDatabase,
  type AppDatabase,
} from "@/lib/db";
import { resumeEngine, suspendEngine } from "@/lib/sync-engine";

/**
 * Renders a real app component live inside the manual, against a throwaway,
 * fixture-seeded database. While a preview is mounted the active database is
 * swapped (see `setActiveDatabase`) and the sync engine is suspended, so the
 * component is fully interactive but completely isolated from the user's real
 * data — nothing it reads or writes leaves the preview.
 */
export function ComponentPreview({
  seed,
  children,
}: {
  seed: (database: AppDatabase) => Promise<void>;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [generation, setGeneration] = useState(0);

  const queryClientRef = useRef<QueryClient | null>(null);
  if (queryClientRef.current === null) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    const preview = createPreviewDatabase();
    suspendEngine();
    setActiveDatabase(preview);

    void (async () => {
      try {
        await preview.open();
        await seed(preview);
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      resetActiveDatabase();
      resumeEngine();
      void preview.delete();
    };
  }, [seed, generation]);

  const handleReset = () => {
    setStatus("loading");
    setGeneration((g) => g + 1);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" />
          Live preview · sample data · changes are not saved
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>
      <div className="p-3">
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing preview…
          </div>
        )}
        {status === "error" && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            The preview could not be loaded.
          </p>
        )}
        {status === "ready" && (
          <QueryClientProvider client={queryClientRef.current}>
            <div key={generation}>{children}</div>
          </QueryClientProvider>
        )}
      </div>
    </div>
  );
}
