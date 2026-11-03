/**
 * The medical journal: add, list and delete entries.
 *
 * An entry is a dated note in the person's own words, with a title and
 * whatever structure was said (kind, body places, a 0-10 rating). There is no
 * edit-in-place and no "ongoing" state: if something comes back, it is a new
 * entry. Deleting an entry blanks its content (lib/synced-write.ts), so it
 * cannot be undone.
 */
import { db, type JournalEntry, type JournalEntryKind, type JournalTimePrecision, type HealthRecordSource } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { JOURNAL_FINDING_MAX, JOURNAL_WORDS_MAX, isPlaceId, titleFromWords } from "@intake/core/journal";
import { generateId, syncFields } from "@/lib/utils";
import { getActiveRecords, getRecordsBetween, softDeleteRecord } from "@/lib/record-crud";
import { syncedWrite } from "@/lib/synced-write";

export interface NewJournalEntry {
  words: string;
  /** Falls back to the start of `words` when blank. */
  finding?: string | undefined;
  kind: JournalEntryKind;
  places?: readonly string[] | undefined;
  severity?: number | null | undefined;
  timestamp?: number | undefined;
  timePrecision?: JournalTimePrecision | undefined;
  source?: HealthRecordSource | undefined;
}

/** The entry as it would be stored, or the reason it cannot be. */
export function buildJournalEntry(input: NewJournalEntry, now: number): ServiceResult<JournalEntry> {
  const words = input.words.trim();
  if (!words) return err("Write what you noticed");
  if (words.length > JOURNAL_WORDS_MAX) return err(`Keep it under ${JOURNAL_WORDS_MAX} characters`);
  const finding = (input.finding?.trim() || titleFromWords(words)).slice(0, JOURNAL_FINDING_MAX);
  const places = [...new Set(input.places ?? [])];
  const unknown = places.find((p) => !isPlaceId(p));
  if (unknown) return err(`Pick a side for "${unknown}"`);
  const severity = input.severity ?? null;
  if (severity !== null && !(Number.isInteger(severity) && severity >= 0 && severity <= 10)) {
    return err("Intensity is a whole number from 0 to 10");
  }
  const timestamp = input.timestamp ?? now;
  if (!Number.isFinite(timestamp)) return err("Pick a valid time");
  if (timestamp > now + 60_000) return err("The time cannot be in the future");
  return ok({
    id: generateId(),
    timestamp,
    timePrecision: input.timePrecision ?? "exact",
    words,
    finding,
    kind: input.kind,
    places,
    severity,
    ...(input.source !== undefined && { source: input.source }),
    ...syncFields(),
  });
}

export async function addJournalEntry(input: NewJournalEntry): Promise<ServiceResult<JournalEntry>> {
  const built = buildJournalEntry(input, Date.now());
  if (!built.success) return built;
  try {
    await syncedWrite(["journalEntries"], (w) => w.insert("journalEntries", built.data));
    return ok(built.data);
  } catch (e) {
    return err("Failed to add journal entry", e);
  }
}

/** Live entries, newest first. */
export function getJournalEntries(limit?: number): Promise<JournalEntry[]> {
  return getActiveRecords<JournalEntry>(db.journalEntries, limit);
}

/** Live entries between two times (inclusive). */
export function getJournalEntriesBetween(startTime: number, endTime: number): Promise<JournalEntry[]> {
  return getRecordsBetween<JournalEntry>(db.journalEntries, startTime, endTime);
}

/** Delete an entry. Its words, title, places and rating are blanked: there is no undo. */
export function deleteJournalEntry(id: string): Promise<ServiceResult<void>> {
  return softDeleteRecord<JournalEntry>(db.journalEntries, "journalEntries", id, "Failed to delete journal entry");
}
