"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMigrationStore } from "@/stores/migration-store";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";

interface CompletionSummaryStepProps {
  onDone: () => void;
  migrationStartTime: number;
}

function tableLabel(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function CompletionSummaryStep({
  onDone,
  migrationStartTime,
}: CompletionSummaryStepProps) {
  const { tableProgress } = useMigrationStore();
  const duration = Date.now() - migrationStartTime;

  const totalUploaded = Object.values(tableProgress).reduce(
    (sum, p) => sum + p.uploaded,
    0,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h2 className="text-xl font-semibold">Migration Complete</h2>
        <p className="text-sm text-muted-foreground">
          {totalUploaded.toLocaleString()} records uploaded in{" "}
          {formatDuration(duration)}
        </p>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {TABLE_PUSH_ORDER.map((name) => {
          const progress = tableProgress[name];
          if (!progress || progress.total === 0) return null;
          return (
            <div
              key={name}
              className="flex items-center justify-between text-sm px-2 py-1"
            >
              <span>{tableLabel(name)}</span>
              <span className="text-muted-foreground tabular-nums">
                {progress.uploaded.toLocaleString()} records
              </span>
            </div>
          );
        })}
      </div>

      <Button onClick={onDone} className="w-full">
        Done
      </Button>
    </div>
  );
}
