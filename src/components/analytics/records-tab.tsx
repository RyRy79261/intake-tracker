"use client";

import type { TimeRange } from "@/lib/analytics-types";

interface RecordsTabProps {
  range: TimeRange;
}

/** Placeholder - fully implemented in Task 2 */
export function RecordsTab({ range }: RecordsTabProps) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <p>Records for {new Date(range.start).toLocaleDateString()} - {new Date(range.end).toLocaleDateString()}</p>
    </div>
  );
}
