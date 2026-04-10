"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared shell for inline edit forms used by card components.
 * Renders domain-specific children, then timestamp, note, and Save/Cancel.
 */
export function InlineEditFormShell({
  children,
  timestamp,
  onTimestampChange,
  note,
  onNoteChange,
  onSave,
  onCancel,
  buttonClassName,
}: {
  children?: ReactNode;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  buttonClassName?: string;
}) {
  return (
    <div className="space-y-2">
      {children}
      <Input type="datetime-local" value={timestamp} onChange={(e) => onTimestampChange(e.target.value)} className="h-8 text-sm" />
      <Input placeholder="Note (optional)" value={note} onChange={(e) => onNoteChange(e.target.value)} className="h-8 text-sm" />
      <div className="flex gap-2">
        <Button size="sm" className={cn("flex-1 h-8", buttonClassName)} onClick={onSave}>Save</Button>
        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

interface RecentEntriesListProps<T extends { id: string }> {
  records: T[] | undefined;
  /** Render the content columns for a single entry (timestamp, value, etc.) */
  renderEntry: (record: T) => ReactNode;
  onDelete: (id: string) => void;
  deletingId: string | null;
  borderColor: string;
  maxEntries?: number;
  /** If provided, clicking an entry row opens the edit form for that record */
  onEdit?: (record: T) => void;
  /** ID of the record currently being edited inline */
  editingId?: string | null;
  /** Render an inline edit form (record available via parent closure) */
  renderEditForm?: () => ReactNode;
}

/**
 * Shared "Recent" entries section used by all card components.
 * Renders a border-top separator, "Recent" label, entries with delete buttons.
 * Entries are clickable when an `onEdit` handler is provided.
 */
export function RecentEntriesList<T extends { id: string }>({
  records,
  renderEntry,
  onDelete,
  deletingId,
  borderColor,
  maxEntries = 3,
  onEdit,
  editingId,
  renderEditForm,
}: RecentEntriesListProps<T>) {
  if (!records || records.length === 0) return null;

  const displayRecords = records.slice(0, maxEntries);

  return (
    <div className={cn("mt-4 pt-4 border-t", borderColor)}>
      <p className="text-xs font-medium text-muted-foreground mb-2">Recent</p>
      <div className="space-y-1">
        {displayRecords.map((record) => {
          const isEditing = editingId === record.id && renderEditForm;
          if (isEditing) {
            return (
              <div
                key={record.id}
                className="bg-muted/30 rounded-lg p-2 -mx-1.5"
              >
                {renderEditForm()}
              </div>
            );
          }
          return (
            <div
              key={record.id}
              className={cn(
                "flex items-center justify-between text-sm py-1",
                onEdit && "cursor-pointer rounded-md -mx-1.5 px-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10"
              )}
              onClick={onEdit ? () => onEdit(record) : undefined}
              role={onEdit ? "button" : undefined}
              tabIndex={onEdit ? 0 : undefined}
              onKeyDown={
                onEdit
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onEdit(record);
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between min-w-0 flex-1 gap-2">
                {renderEntry(record)}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete entry"
                className="h-6 w-6 text-muted-foreground hover:text-red-600 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(record.id);
                }}
                disabled={deletingId === record.id}
              >
                {deletingId === record.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
