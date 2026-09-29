"use client";

import type { ReactNode} from "react";
import { useId } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeOnly, getCurrentDateTimeLocal } from "@/lib/date-utils";
import { recentDayLabel } from "@/lib/week-utils";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Shared shell for inline edit forms used by card components.
 * Renders domain-specific children, then timestamp, note, and Save/Cancel.
 * When `labeled` is true, the timestamp and note inputs render visible
 * `<Label>` elements above them; otherwise they fall back to placeholders
 * + `aria-label` for backwards compatibility with cards that haven't been
 * migrated. The datetime `max` is only a picker hint (Save is a click
 * handler, not a form submit); useEditRecord rejects future times on save.
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
  labeled = false,
  idPrefix = "edit",
}: {
  children?: ReactNode;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  buttonClassName?: string;
  labeled?: boolean;
  idPrefix?: string;
}) {
  // Per-instance unique suffix so two shells mounted with the same idPrefix
  // (e.g. the default "edit") don't produce colliding DOM ids.
  const instanceId = useId();
  const tsId = `${idPrefix}-${instanceId}-timestamp`;
  const noteId = `${idPrefix}-${instanceId}-note`;
  return (
    <div className="space-y-2">
      {children}
      {labeled ? (
        <>
          <div className="space-y-1">
            <Label htmlFor={tsId} className="text-xs text-muted-foreground">
              Date and time
            </Label>
            <Input id={tsId} type="datetime-local" max={getCurrentDateTimeLocal()} value={timestamp} onChange={(e) => onTimestampChange(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={noteId} className="text-xs text-muted-foreground">
              Note <span className="font-normal">(optional)</span>
            </Label>
            <Input id={noteId} value={note} onChange={(e) => onNoteChange(e.target.value)} className="h-8 text-sm" />
          </div>
        </>
      ) : (
        <>
          <Input aria-label="Entry date and time" type="datetime-local" max={getCurrentDateTimeLocal()} value={timestamp} onChange={(e) => onTimestampChange(e.target.value)} className="h-8 text-sm" />
          <Input aria-label="Entry note" placeholder="Note (optional)" value={note} onChange={(e) => onNoteChange(e.target.value)} className="h-8 text-sm" />
        </>
      )}
      <div className="flex gap-2">
        <Button size="sm" className={cn("flex-1 h-8", buttonClassName)} onClick={onSave}>Save</Button>
        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

interface RecentEntriesListProps<T extends { id: string; timestamp: number }> {
  records: T[] | undefined;
  /** The middle column: what the entry was (name, position, note...). */
  renderLabel?: (record: T) => ReactNode;
  /** The right column: the entry's value, right-aligned in mono. */
  renderValue?: (record: T) => ReactNode;
  onDelete: (id: string) => void;
  deletingId: string | null;
  maxEntries?: number;
  /** If provided, clicking an entry row opens the edit form for that record */
  onEdit?: (record: T) => void;
  /** ID of the record currently being edited inline */
  editingId?: string | null;
  /** Render an inline edit form (record available via parent closure) */
  renderEditForm?: () => ReactNode;
  /** Shown when there is nothing to list. */
  emptyText?: string;
}

/**
 * The "Recent" list at the foot of every Home module card (the prototype's
 * `.rec`). Each row is a grid: time | label | value | delete. Entries from an
 * earlier logical day carry a day prefix above the time ("Yest", "Fri").
 * Rows are clickable when an `onEdit` handler is provided.
 */
export function RecentEntriesList<T extends { id: string; timestamp: number }>({
  records,
  renderLabel,
  renderValue,
  onDelete,
  deletingId,
  maxEntries = 3,
  onEdit,
  editingId,
  renderEditForm,
  emptyText = "Nothing logged yet.",
}: RecentEntriesListProps<T>) {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  if (!records) return null;

  const displayRecords = records.slice(0, maxEntries);

  return (
    <div className="wc-rec" data-testid="recent-entries">
      <h4>Recent</h4>
      {displayRecords.length === 0 && <p className="empty">{emptyText}</p>}
      {displayRecords.map((record) => {
        const isEditing = editingId === record.id && renderEditForm;
        if (isEditing) {
          return (
            <div key={record.id} className="wc-ri-edit">
              {renderEditForm()}
            </div>
          );
        }
        const day = recentDayLabel(record.timestamp, dayStartHour);
        return (
          <div
            key={record.id}
            className="wc-ri"
            data-testid="recent-entry"
            onClick={onEdit ? () => onEdit(record) : undefined}
            role={onEdit ? "button" : undefined}
            tabIndex={onEdit ? 0 : undefined}
            onKeyDown={
              onEdit
                ? (e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEdit(record);
                    }
                  }
                : undefined
            }
          >
            <span className="tm">
              {day && <span>{day}</span>}
              <span>{formatTimeOnly(record.timestamp)}</span>
            </span>
            <span className="lb">{renderLabel?.(record)}</span>
            <span className="v">{renderValue?.(record)}</span>
            <button
              type="button"
              className="del"
              aria-label="Delete entry"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(record.id);
              }}
              disabled={deletingId === record.id}
            >
              {deletingId === record.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
