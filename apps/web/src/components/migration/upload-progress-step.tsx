"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Progress } from "@intake/ui/progress";
import { Spinner } from "@intake/ui/spinner";
import { useMigrationStore, type TableProgress } from "@/stores/migration-store";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";
import { cn } from "@/lib/utils";
import {
  bodyClass,
  footClass,
  migClass,
  migHeadingClass,
  migTextClass,
  tableLabel,
  tlistClass,
  tlistRowClass,
  tlistValueClass,
} from "@/components/migration/dialog-kit";

interface UploadProgressStepProps {
  onCancel: () => void;
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
    <>
      <div className={bodyClass}>
        <div className={migClass} data-testid="migration-upload-step">
          <h3 className={migHeadingClass}>Uploading data</h3>
          <p className={migTextClass}>
            {currentTable ? `Uploading ${tableLabel(currentTable)}…` : "Counting records…"}
          </p>
          <p className="font-mono text-sm font-semibold text-foreground">
            {uploadedRecords.toLocaleString()} / {totalRecords.toLocaleString()} records ({percentage}%)
          </p>

          {/* `.pbar`: a 1px ruled well with a 2px inset water fill. */}
          <div className="h-3.5 w-full border border-line bg-background p-0.5">
            <Progress
              value={percentage}
              aria-label="Upload progress"
              className="h-full bg-transparent"
              indicatorClassName="bg-water"
            />
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            {expanded ? "Hide details" : "Show details"}
            <ChevronDown
              aria-hidden="true"
              className={cn("h-4 w-4 shrink-0", expanded && "rotate-180")}
            />
          </button>

          {expanded && (
            <div className={tlistClass} data-testid="migration-table-list">
              {TABLE_PUSH_ORDER.map((name, i) => {
                const progress = tableProgress[name];
                const status = tableStatus(progress, i, currentTableIndex);
                return (
                  <div key={name} className={tlistRowClass} data-status={status}>
                    <span
                      className={cn(
                        "flex items-center justify-center",
                        status === "done" ? "text-weight" : "text-muted-foreground",
                      )}
                    >
                      {status === "done" && <Check aria-label="Done" className="h-4 w-4" />}
                      {status === "uploading" && <Spinner label="Uploading" />}
                      {status === "pending" && <Circle aria-label="Waiting" className="h-4 w-4" />}
                    </span>
                    <span>{tableLabel(name)}</span>
                    <span className={tlistValueClass}>
                      {progress
                        ? `${progress.uploaded.toLocaleString()} / ${progress.total.toLocaleString()}`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={footClass}>
        <Button variant="outline" className="border-muted-foreground" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}
