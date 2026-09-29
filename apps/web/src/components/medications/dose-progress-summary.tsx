"use client";

import type { DoseSlot } from "@/hooks/use-medication-queries";
import { computeProgress } from "@/lib/medication-ui-utils";
import { SegmentBar } from "@/components/home/module-card";

interface DoseProgressSummaryProps {
  slots: DoseSlot[];
  lowStockWarnings: string[];
}

/** A finished day: a card with the meds stripe. */
function DoneCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-line bg-background p-3 shadow-[inset_3px_0_0_hsl(var(--meds))]">
      <p className="mb-1 text-base font-semibold">{title}</p>
      <p className="text-[0.8125rem] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function DoseProgressSummary({ slots, lowStockWarnings }: DoseProgressSummaryProps) {
  // pct/allDone count skipped doses as handled (deliberately — a skipped dose
  // needs no further action). The copy says "handled" and shows taken and
  // skipped apart, and only a day with every dose taken is celebrated.
  const { total, taken, skipped, pct, allDone } = computeProgress(slots);
  const counts = `${taken} taken · ${skipped} skipped · ${total} total`;

  if (allDone && total > 0 && skipped === 0) {
    return <DoneCard title="All done for today!" detail={`${taken}/${total} doses taken`} />;
  }

  if (allDone && total > 0) {
    return <DoneCard title="All doses handled" detail={counts} />;
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.8125rem] text-muted-foreground">
        <span>{counts}</span>
        <span className="whitespace-nowrap">{pct}% handled</span>
      </div>
      <SegmentBar value={taken + skipped} limit={total} domain="meds" aria-label="Doses handled today" />
      {lowStockWarnings.length > 0 && (
        <p className="mt-1.5 text-[0.8125rem] text-sodium">
          Low stock: {lowStockWarnings.join(", ")}
        </p>
      )}
    </div>
  );
}
