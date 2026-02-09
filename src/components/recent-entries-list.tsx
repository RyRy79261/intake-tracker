"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentEntriesListProps<T extends { id: string }> {
  records: T[] | undefined;
  /** Render the content columns for a single entry (timestamp, value, etc.) */
  renderEntry: (record: T) => ReactNode;
  onDelete: (id: string) => void;
  deletingId: string | null;
  borderColor: string;
  maxEntries?: number;
}

/**
 * Shared "Recent" entries section used by all card components.
 * Renders a border-top separator, "Recent" label, entries with delete buttons.
 */
export function RecentEntriesList<T extends { id: string }>({
  records,
  renderEntry,
  onDelete,
  deletingId,
  borderColor,
  maxEntries = 3,
}: RecentEntriesListProps<T>) {
  if (!records || records.length === 0) return null;

  const displayRecords = records.slice(0, maxEntries);

  return (
    <div className={cn("mt-4 pt-4 border-t", borderColor)}>
      <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
      <div className="space-y-1">
        {displayRecords.map((record) => (
          <div
            key={record.id}
            className="flex items-center justify-between text-sm py-1"
          >
            {renderEntry(record)}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete entry"
              className="h-6 w-6 text-muted-foreground hover:text-red-600 shrink-0"
              onClick={() => onDelete(record.id)}
              disabled={deletingId === record.id}
            >
              {deletingId === record.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
