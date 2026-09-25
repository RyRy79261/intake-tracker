"use client";

import { useState, useCallback, useRef, type FormEvent } from "react";
import { useToast } from "@intake/ui/use-toast";
import {
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";
import {
  FUTURE_TIMESTAMP_MESSAGE,
  isFutureTimestamp,
} from "@intake/core/record-schemas";

export type EditedTimestampResult =
  | { ok: true; timestamp: number }
  | { ok: false; message: string };

/**
 * Resolve a datetime-local edit against the record's original timestamp.
 *
 * - Unchanged minute → the original timestamp, untouched. The input is
 *   minute-precision, so re-parsing it would silently drop the original
 *   seconds and reorder near-simultaneous records.
 * - Unparseable → "Invalid date/time"; future (beyond the skew) → rejected.
 *   An untouched legacy future timestamp is not re-checked, so its other
 *   fields stay editable.
 */
export function resolveEditedTimestamp(
  originalTimestamp: number,
  editedLocal: string,
): EditedTimestampResult {
  if (editedLocal === timestampToDateTimeLocal(originalTimestamp)) {
    return { ok: true, timestamp: originalTimestamp };
  }
  let timestamp: number;
  try {
    // dateTimeLocalToTimestamp throws (it never returns NaN) on bad input.
    timestamp = dateTimeLocalToTimestamp(editedLocal);
  } catch {
    return { ok: false, message: "Invalid date/time" };
  }
  if (isFutureTimestamp(timestamp)) {
    return { ok: false, message: FUTURE_TIMESTAMP_MESSAGE };
  }
  return { ok: true, timestamp };
}

/**
 * Generic hook for the "tap recent entry → edit dialog → save" pattern.
 *
 * Manages:
 *  - `editingRecord` (the record being edited, or null)
 *  - `editTimestamp` / `editNote` (common to every record type)
 *  - `openEdit(record)` — populates common fields + calls `onOpen` for extras
 *  - `handleEditSubmit(e)` — parses timestamp, calls `buildUpdates`, submits,
 *     shows toasts, and closes on success
 *
 * The consumer only needs to:
 *  1. Keep extra field state (e.g. `editWeight`, `editSystolic`) in its component
 *  2. Provide `onOpen` to populate those extra fields from the record
 *  3. Provide `buildUpdates` returning the updates object (or `null` to abort)
 *  4. Pass the mutation's `mutateAsync`
 */

interface UseEditRecordOptions<
  T extends { id: string; timestamp: number; note?: string },
> {
  /** Populate any extra form fields when a record is opened for editing. */
  onOpen?: (record: T) => void;

  /**
   * Build the `updates` payload from the current form state.
   * `timestamp` is already parsed and validated (the original, exact value
   * when the minute was not changed); `note` is already trimmed (or
   * `undefined` if blank). To clear an optional field send `null` (e.g.
   * `note: note ?? null`): an explicit `undefined` makes Dexie delete the key
   * locally, but the missing key never reaches the server, so the old value
   * returns on the next pull. Return `null` to abort (show your own toast
   * before returning null).
   */
  buildUpdates: (timestamp: number, note: string | undefined) => object | null;

  /** The TanStack‑Query mutation's `mutateAsync` — must accept `{ id, updates }`. */
  mutateAsync: (params: { id: string; updates: object }) => Promise<unknown>;
}

interface UseEditRecordReturn<T> {
  /** The record currently being edited, or `null`. */
  editingRecord: T | null;
  editTimestamp: string;
  editNote: string;
  setEditTimestamp: (value: string) => void;
  setEditNote: (value: string) => void;
  /** Open the edit dialog for a given record. */
  openEdit: (record: T) => void;
  /** Close the edit dialog without saving. */
  closeEdit: () => void;
  /** Submit handler — call with optional form event. */
  handleEditSubmit: (e?: FormEvent) => Promise<void>;
}

export function useEditRecord<
  T extends { id: string; timestamp: number; note?: string },
>(options: UseEditRecordOptions<T>): UseEditRecordReturn<T> {
  const { toast } = useToast();

  const [editingRecord, setEditingRecord] = useState<T | null>(null);
  const [editTimestamp, setEditTimestamp] = useState("");
  const [editNote, setEditNote] = useState("");

  // Keep latest callbacks in refs so the memoised handlers always call the
  // most recent version (avoids stale‑closure bugs without requiring the
  // consumer to memoize their callbacks).
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const openEdit = useCallback((record: T) => {
    setEditingRecord(record);
    setEditTimestamp(timestampToDateTimeLocal(record.timestamp));
    setEditNote(record.note || "");
    optionsRef.current.onOpen?.(record);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingRecord(null);
  }, []);

  const handleEditSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!editingRecord) return;

      const resolved = resolveEditedTimestamp(editingRecord.timestamp, editTimestamp);
      if (!resolved.ok) {
        toast({ title: resolved.message, variant: "destructive" });
        return;
      }

      const note = editNote.trim() || undefined;
      const updates = optionsRef.current.buildUpdates(resolved.timestamp, note);
      if (updates === null) return; // consumer aborted (e.g. validation toast)

      try {
        await optionsRef.current.mutateAsync({
          id: editingRecord.id,
          updates,
        });
        setEditingRecord(null);
        toast({ title: "Entry updated" });
      } catch {
        toast({
          title: "Error",
          description: "Could not update the entry",
          variant: "destructive",
        });
      }
    },
    [editingRecord, editTimestamp, editNote, toast],
  );

  return {
    editingRecord,
    editTimestamp,
    editNote,
    setEditTimestamp,
    setEditNote,
    openEdit,
    closeEdit,
    handleEditSubmit,
  };
}
