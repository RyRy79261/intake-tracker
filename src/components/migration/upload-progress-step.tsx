"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Loader2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMigrationStore, type TableProgress } from "@/stores/migration-store";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";

interface UploadProgressStepProps {
  onCancel: () => void;
}

function tableLabel(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function tableStatus(
  progress: TableProgress | undefined,
  tableIndex: number,
  currentIndex: number,
): "pending" | "uploading" | "done" {
  if (!progress) return tableIndex <= currentIndex ? "uploading" : "pending";
  if (progress.uploaded >= progress.total && progress.total >= 0 && progress.lastBatchIndex >= 0)
    return "done";
  if (tableIndex === currentIndex) return "uploading";
  return tableIndex < currentIndex ? "done" : "pending";
}

export function UploadProgressStep({ onCancel }: UploadProgressStepProps) {
  const [expanded, setExpanded] = useState(false);
  const { tableProgress, currentTableIndex } = useMigrationStore();

  const totalRecords = Object.values(tableProgress).reduce(
    (sum, p) => sum + p.total,
    0,
  );
  const uploadedRecords = Object.values(tableProgress).reduce(
    (sum, p) => sum + p.uploaded,
    0,
  );
  const percentage = totalRecords > 0 ? Math.round((uploadedRecords / totalRecords) * 100) : 0;

  const currentTable = TABLE_PUSH_ORDER[currentTableIndex];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold">Uploading data</h2>
        <p className="text-sm text-muted-foreground">
          {currentTable ? `Uploading ${tableLabel(currentTable)}…` : "Preparing…"}{" "}
          {percentage}%
        </p>
      </div>

      <Progress value={percentage} className="h-3" />

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? "Hide details" : "Show details"}
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {TABLE_PUSH_ORDER.map((name, i) => {
            const progress = tableProgress[name];
            const status = tableStatus(progress, i, currentTableIndex);
            return (
              <div
                key={name}
                className="flex items-center justify-between text-sm px-2 py-1 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {status === "done" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {status === "pending" && (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{tableLabel(name)}</span>
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {progress
                    ? `${progress.uploaded.toLocaleString()} / ${progress.total.toLocaleString()}`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="outline" onClick={onCancel} className="mt-auto">
        Cancel
      </Button>
    </div>
  );
}
