"use client";

import { Check } from "lucide-react";
import { Button } from "@intake/ui/button";
import { useMigrationStore } from "@/stores/migration-store";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";
import {
  bodyClass,
  footClass,
  migClass,
  migHeadingClass,
  migTextClass,
  tableLabel,
  tlistClass,
  tlistRowPlainClass,
  tlistValueClass,
} from "@/components/migration/dialog-kit";

interface CompletionSummaryStepProps {
  onDone: () => void;
  migrationStartTime: number;
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

  // `uploaded` counts rows sent; the server may have rejected some of them
  // (audit sync-engine#12). Those are queued and retried once sync starts.
  const totalRejected = Object.values(tableProgress).reduce(
    (sum, p) => sum + (p.rejected ?? 0),
    0,
  );
  const totalUploaded =
    Object.values(tableProgress).reduce((sum, p) => sum + p.uploaded, 0) -
    totalRejected;

  return (
    <>
      <div className={bodyClass}>
        <div className={migClass} data-testid="migration-complete-step">
          <Check aria-hidden="true" className="h-8 w-8 text-weight" />
          <h3 className={migHeadingClass}>Migration Complete</h3>
          <p className={migTextClass}>
            <span className="font-mono">{totalUploaded.toLocaleString()}</span> records
            uploaded in <span className="font-mono">{formatDuration(duration)}</span>
          </p>
          {totalRejected > 0 && (
            <p className="w-full border border-sodium bg-sodium/10 p-2.5 text-left text-[0.8125rem] leading-[1.45]">
              <span className="font-mono">{totalRejected.toLocaleString()}</span>{" "}
              {totalRejected === 1 ? "record was" : "records were"} not accepted
              by the server. They stay on this device and will be retried when
              sync starts.
            </p>
          )}

          <div className={tlistClass}>
            {TABLE_PUSH_ORDER.map((name) => {
              const progress = tableProgress[name];
              if (!progress || progress.total === 0) return null;
              return (
                <div key={name} className={tlistRowPlainClass}>
                  <span>{tableLabel(name)}</span>
                  <span className={tlistValueClass}>
                    {(progress.uploaded - (progress.rejected ?? 0)).toLocaleString()}{" "}
                    records
                    {progress.rejected ? `, ${progress.rejected} not accepted` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={footClass}>
        <Button onClick={onDone}>Done</Button>
      </div>
    </>
  );
}
