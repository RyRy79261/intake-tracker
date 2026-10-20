"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Mic, X } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@intake/ui/card";
import { useToast } from "@intake/ui/use-toast";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { ParsedItemRow, type ParsedItemNote } from "@/components/voice/parsed-item-row";
import { useLogParsedEntry } from "@/hooks/use-parsed-entry";
import {
  isMedicationItem,
  isRefreshable,
  type RefreshableItem,
  type VoiceParsedItem,
  type VoiceParseResponse,
} from "@/lib/voice-types";
import { reconcileLiquidItems } from "@/lib/voice-reconcile";
import { applyPresetCaffeine } from "@/lib/voice-presets";
import { validateVoiceItem } from "@/lib/voice-validation";
import {
  clientNowForParse,
  formatLocalDateTime,
  isLongAgo,
  normalizeSpokenTiming,
  spokenTimestamp,
} from "@/lib/voice-time";
import { getDeviceTimezone } from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";
import {
  loadVoiceMedicationContext,
  useVoiceMedicationContext,
} from "@/hooks/use-voice-medication";
import {
  describePlan,
  medicationDates,
  medicationsForParse,
  planMedicationItem,
  saveMedicationPlan,
  type PlanResult,
  type VoiceMedicationContext,
} from "@/lib/voice-medication";
import type { MedicationRowState } from "@/components/voice/parsed-item-row";
import { useSettingsStore } from "@/stores/settings-store";
import { aiClient } from "@/lib/ai-client";
import { useQueryClient } from "@tanstack/react-query";

type RowState = {
  /** Stable across list changes, so an async refresh finds its row again. */
  id: number;
  item: VoiceParsedItem;
  approved: boolean | null;
  /**
   * True once this row has been written to the database. A partial commit
   * leaves the review list open so the user can retry the failures, and
   * without this flag that retry re-saved every item that had already
   * succeeded — duplicating them.
   */
  saved: boolean;
  /** Merge / preset / duplicate notes anchored to this row. */
  notes: ParsedItemNote[];
  /**
   * A possible duplicate of another row. "Approve all" leaves it pending so
   * the user resolves the pair one row at a time.
   */
  flagged: boolean;
  /** An AI re-look-up of this one row is in flight. */
  refreshing: boolean;
  /** A late dose row: the user picked "Take now" (record the save time). */
  takeNow?: boolean;
};

/**
 * What a row's refresh sends to the parser: the edited description, plus the
 * amount the user already has, so a corrected name keeps its portion.
 */
function refreshText(item: RefreshableItem): string {
  const description = item.description.trim();
  if (item.kind === "food") {
    return item.grams !== undefined ? `${description} (${item.grams} g)` : description;
  }
  return item.volumeMl !== undefined ? `${description} (${item.volumeMl} ml)` : description;
}

/** Plain-language notices about what the parse left out. */
function parseNotices(data: VoiceParseResponse): string[] {
  const notices: string[] = [];
  if (data.transcriptTruncated) {
    notices.push(
      "The recording was too long — the end of the transcript was not parsed. Record anything missing separately.",
    );
  }
  if (data.dropped) {
    notices.push(
      `${data.dropped} ${data.dropped === 1 ? "item was" : "items were"} incomplete and left out — check the transcript and log anything missing.`,
    );
  }
  if (data.overCap) {
    notices.push(
      `${data.overCap} more ${data.overCap === 1 ? "item was" : "items were"} over the per-recording limit and left out.`,
    );
  }
  return notices;
}

/** A planned row still waiting for "Take now", "Take at a specific time" or "Skip". */
function needsChoice(planned: PlanResult | null | undefined): boolean {
  return !!planned?.ok && planned.plan.kind === "scheduled_dose" && planned.plan.needsTimeChoice;
}

/**
 * What saving a medication row would do, against the loaded list, with the
 * row's own time or `now`. Not a medication row → null.
 */
function planRow(
  row: Pick<RowState, "item" | "takeNow">,
  ctx: VoiceMedicationContext | undefined,
  now: number,
  timeZone: string,
): PlanResult | null | undefined {
  const { item } = row;
  if (!isMedicationItem(item)) return null;
  if (!ctx) return undefined;
  return planMedicationItem(item, ctx, spokenTimestamp(item, now, timeZone), item.at !== undefined, {
    now,
    lateWindowMinutes: useSettingsStore.getState().lateWindowMinutes,
    ...(row.takeNow && { takeNow: true }),
  });
}

interface VoicePanelProps {
  /** Called once a save commit succeeds so the host can close the modal. */
  onCommitted?: () => void;
  /**
   * A clip already recorded by the host (the Ward shell's hold-to-talk
   * button). It is transcribed and parsed once, on mount, exactly as if the
   * panel's own recorder had produced it.
   */
  initialClip?: { blob: Blob; mimeType: string } | null;
}

export function VoicePanel({ onCommitted, initialClip }: VoicePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logParsedEntry = useLogParsedEntry();
  const liquidPresets = useSettingsStore((s) => s.liquidPresets);

  const [transcript, setTranscript] = useState<string>("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [stage, setStage] = useState<"idle" | "transcribing" | "parsing" | "ready" | "saving">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const nextRowId = useRef(0);

  // The medication list and the dose slots of the days medication rows may
  // mean (today, yesterday, and each row's own day), for planning those rows
  // and for telling the parser what is on the list.
  const medicationDays = medicationDates(
    rows
      .filter((r) => isMedicationItem(r.item) && r.item.at !== undefined)
      .map((r) => spokenTimestamp(r.item, Date.now(), getDeviceTimezone())),
  );
  const medicationContext = useVoiceMedicationContext(medicationDays);
  const medicationContextRef = useRef(medicationContext);
  medicationContextRef.current = medicationContext;
  const medicineNames = useMemo(
    () =>
      medicationContext
        ? [...new Set(medicationContext.prescriptions.filter((p) => p.isActive).map((p) => p.genericName))]
        : [],
    [medicationContext],
  );

  const pendingCount = useMemo(
    () => rows.filter((r) => r.approved === null).length,
    [rows]
  );
  // Approved but not yet written. After a partial commit the already-saved
  // rows drop out, so the Save button counts (and offers) only the retry.
  const approvedCount = useMemo(
    () => rows.filter((r) => r.approved === true && !r.saved).length,
    [rows]
  );
  const savedCount = useMemo(() => rows.filter((r) => r.saved).length, [rows]);
  // Save waits for every refresh: a row mid-refresh still holds the values
  // the user asked to replace.
  const anyRefreshing = rows.some((r) => r.refreshing);

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      // Rows from an earlier recording that are not yet saved are kept — the
      // new items are appended below them. Replacing the list threw away
      // approved rows (and, after a partial save, rows that had failed)
      // without a word.
      setError(null);
      setRows((prev) => prev.filter((r) => !r.saved));
      setTranscript("");
      setReasoning(null);
      setNotices([]);
      setStage("transcribing");
      // The moment the user stopped speaking: "now" for everything they said.
      const spokenAt = Date.now();
      const timeZone = getDeviceTimezone();

      try {
        const ext =
          mimeType.includes("mp4") || mimeType.includes("aac")
            ? "m4a"
            : mimeType.includes("ogg")
              ? "ogg"
              : "webm";

        const form = new FormData();
        form.append("audio", blob, `clip.${ext}`);

        const transcribed = await aiClient.call("/api/ai/voice-transcribe", form);
        if (!transcribed.ok) throw new Error(transcribed.error.message);
        const { text } = transcribed.data;
        setTranscript(text);

        setStage("parsing");
        // The device's clock goes with the transcript: the parser cannot
        // date "yesterday at 8pm" without knowing what today is here.
        // The list is usually loaded by now; a very quick first recording
        // reads it directly rather than telling the parser it is empty.
        const ctx =
          medicationContextRef.current ??
          (await loadVoiceMedicationContext(medicationDates([], spokenAt)));
        const parsed = await aiClient.call("/api/ai/voice-parse", {
          transcript: text,
          now: clientNowForParse(spokenAt, timeZone),
          medications: medicationsForParse(ctx, toLocalDateKey(spokenAt)),
        });
        if (!parsed.ok) throw new Error(parsed.error.message);
        const data = parsed.data;
        // Collapse a drink the parser split into two items before the review
        // list is built, so the user approves one row per drink instead of
        // having a correction applied invisibly at save time (issue #322).
        // Spoken times become each item's editable `at` here, measured from
        // the clock the parser was given ("an hour ago" is an hour before the
        // recording ended, not before the reply arrived).
        const reconciled = reconcileLiquidItems(
          data.items.map((item) => normalizeSpokenTiming(item, spokenAt, timeZone)),
        );
        // Voice caffeine follows the user's preset for a named drink, so the
        // same moka books the same caffeine whichever way it was logged.
        const priced = applyPresetCaffeine(reconciled.items, liquidPresets);
        const newRows: RowState[] = priced.items.map((item) => ({
          id: nextRowId.current++,
          item,
          approved: null,
          saved: false,
          notes: [],
          flagged: false,
          refreshing: false,
        }));
        for (const note of [...reconciled.merges, ...priced.notes]) {
          for (const index of note.itemIndices) {
            newRows[index]?.notes.push({ tone: "info", message: note.message });
          }
        }
        for (const warning of reconciled.warnings) {
          for (const index of warning.itemIndices) {
            const row = newRows[index];
            if (!row) continue;
            row.notes.push({ tone: "warning", message: warning.message });
            row.flagged = true;
          }
        }
        const items = priced.items;
        setRows((prev) => [...prev, ...newRows]);
        setReasoning(data.reasoning ?? null);
        setNotices(parseNotices(data));
        setStage("ready");

        if (items.length === 0) {
          toast({
            title: "No items detected",
            description: "The transcript didn't contain extractable health metrics.",
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        setError(message);
        setStage("idle");
        toast({
          title: "Voice processing failed",
          description: message,
          variant: "destructive",
        });
      }
    },
    [toast, liquidPresets]
  );

  // Process a host-recorded clip once. The ref keeps a StrictMode double
  // effect (or a re-render) from sending the same audio twice.
  const processedClipRef = useRef<Blob | null>(null);
  useEffect(() => {
    if (!initialClip || processedClipRef.current === initialClip.blob) return;
    processedClipRef.current = initialClip.blob;
    void handleRecorded(initialClip.blob, initialClip.mimeType);
  }, [initialClip, handleRecorded]);

  const updateRow = useCallback((index: number, next: Partial<RowState>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...next } : r)));
  }, []);

  const patchRowById = useCallback((id: number, next: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, []);

  /**
   * Re-look-up one row with AI after the user fixed its description (a
   * misheard drink name, say). Only that row changes; its time is kept.
   */
  const refreshRow = useCallback(
    async (row: RowState) => {
      const { item } = row;
      if (!isRefreshable(item) || item.description.trim() === "") return;
      patchRowById(row.id, { refreshing: true });
      try {
        const res = await aiClient.call("/api/ai/voice-parse", {
          transcript: refreshText(item),
          kind: item.kind,
        });
        if (!res.ok) throw new Error(res.error.message);
        const data = res.data;
        const found = data.items.find((i) => i.kind === item.kind);
        if (!found) throw new Error("The AI found no matching item. Check the description.");
        // The row keeps the time it already has — a refresh fixes what the
        // item is, not when it happened.
        const { when: _when, at: _at, ...fresh } = found;
        const timed = (item.at !== undefined ? { ...fresh, at: item.at } : fresh) as VoiceParsedItem;
        const priced = applyPresetCaffeine([timed], liquidPresets);
        // Notes about the old values (merges, presets) no longer apply.
        // Possible-duplicate warnings still do.
        const notes: ParsedItemNote[] = [
          ...row.notes.filter((n) => n.tone === "warning"),
          ...priced.notes.map((n) => ({ tone: "info" as const, message: n.message })),
        ];
        patchRowById(row.id, { item: priced.items[0]!, notes, refreshing: false });
      } catch (e) {
        patchRowById(row.id, { refreshing: false });
        toast({
          title: "Refresh failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [patchRowById, liquidPresets, toast],
  );

  // Skips rows that are flagged as a possible duplicate, fail validation, are
  // dated more than a week back, or are mid-refresh: those need the user's
  // attention one at a time.
  const approveAll = useCallback(() => {
    const now = Date.now();
    const timeZone = getDeviceTimezone();
    setRows((prev) =>
      prev.map((r) =>
        r.approved === null &&
        !r.flagged &&
        !r.refreshing &&
        validateVoiceItem(r.item, now, timeZone) === null &&
        planRow(r, medicationContextRef.current, now, timeZone)?.ok !== false &&
        !needsChoice(planRow(r, medicationContextRef.current, now, timeZone)) &&
        !(isMedicationItem(r.item) && !medicationContextRef.current) &&
        !isLongAgo(r.item.at, now, timeZone)
          ? { ...r, approved: true }
          : r,
      ),
    );
  }, []);

  const rejectAll = useCallback(() => {
    setRows((prev) => prev.map((r) => (r.approved === null ? { ...r, approved: false } : r)));
  }, []);

  const reset = useCallback(() => {
    setRows([]);
    setTranscript("");
    setReasoning(null);
    setNotices([]);
    setError(null);
    setStage("idle");
  }, []);

  const commit = useCallback(async () => {
    // Rows already written by an earlier partial commit are skipped, so
    // re-tapping Save after a failure retries only what actually failed.
    const pending = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.approved === true && !row.saved && !row.refreshing);
    if (pending.length === 0) return;

    setStage("saving");
    // One "now" for the whole batch, so items dictated together are logged
    // together; an item with a spoken time is placed at that time instead.
    // The record stores the instant; which day it counts toward follows from
    // it under the day-start hour, as for every other record.
    const batchNow = Date.now();
    const timeZone = getDeviceTimezone();
    const timestampFor = (item: VoiceParsedItem) => spokenTimestamp(item, batchNow, timeZone);
    let successCount = 0;
    const failures: string[] = [];
    const savedIndices: number[] = [];

    for (const { row, index } of pending) {
      const { item } = row;
      try {
        // The logger owns what records an item becomes; the hook reopens a
        // closed database and retries once (issue #287).
        if (isMedicationItem(item)) {
          // Planned again now, against the list as it is at save time.
          const planned = planRow(row, medicationContextRef.current, batchNow, timeZone);
          if (!planned) throw new Error("Your medications have not loaded yet");
          if (!planned.ok) throw new Error(planned.problem);
          await saveMedicationPlan(planned.plan);
        } else {
          await logParsedEntry(item, { timestamp: timestampFor(item), origin: "voice" });
        }
        successCount++;
        savedIndices.push(index);
      } catch (saveError) {
        // console.error is patched by the error-log service, so this both
        // reaches devtools and persists the underlying cause for bug reports.
        console.error(`[voice] save failed for ${item.kind}:`, saveError);
        failures.push(
          `${item.kind}: ${saveError instanceof Error ? saveError.message : "unknown"}`
        );
      }
    }

    if (savedIndices.length > 0) {
      const savedSet = new Set(savedIndices);
      setRows((prev) =>
        prev.map((r, i) => (savedSet.has(i) ? { ...r, saved: true } : r)),
      );
    }

    void queryClient.invalidateQueries();

    toast({
      title: `Saved ${successCount} of ${pending.length}`,
      ...(failures.length > 0 && {
        description: `Failures: ${failures.slice(0, 3).join("; ")}`,
        variant: "destructive" as const,
      }),
    });

    // Only close + clear on a clean save. If anything failed, keep the
    // review state so the user can see what didn't get written and retry.
    if (failures.length === 0) {
      reset();
      onCommitted?.();
    } else {
      setStage("ready");
    }
  }, [rows, toast, reset, queryClient, logParsedEntry, onCommitted]);

  const medicationRowProps = (row: RowState, index: number) => {
    const timeZone = getDeviceTimezone();
    const planned = planRow(row, medicationContext, Date.now(), timeZone);
    if (planned === null) return {};
    const plan = planned?.ok ? planned.plan : undefined;
    const timeChoice =
      plan?.kind === "scheduled_dose" && plan.needsTimeChoice
        ? {
            onTakeNow: () => updateRow(index, { takeNow: true }),
            onPickTime: () =>
              updateRow(index, {
                item: { ...row.item, at: formatLocalDateTime(plan.dueAt ?? Date.now(), timeZone) },
              }),
            onSkip: () =>
              updateRow(index, { item: { ...row.item, action: "skipped" } as VoiceParsedItem }),
          }
        : undefined;
    const medication: MedicationRowState | undefined =
      planned === undefined
        ? undefined
        : planned.ok
          ? { ok: true, lines: describePlan(planned.plan), ...(timeChoice && { timeChoice }) }
          : { ok: false, problem: planned.problem };
    return { ...(medication && { medication }), medicineNames };
  };

  const hasItems = rows.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b pb-3">
        <Mic className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold leading-tight">Voice log</h2>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="-mx-6 flex-1 overflow-y-auto px-6 pt-4">
        <div className={hasItems ? "space-y-4 pb-32" : "space-y-4"}>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-xs text-muted-foreground">
                Tap record and describe everything in one go — blood pressure, heart rate,
                food, drinks, weight, the doses you took, a refill, anything. Stop, review the extracted items, then
                approve or reject each one.
              </p>
              <VoiceRecorder
                onRecorded={handleRecorded}
                busy={stage === "transcribing" || stage === "parsing" || stage === "saving"}
              />
              {stage === "transcribing" && (
                <p className="text-center text-xs text-muted-foreground">
                  Transcribing with Groq Whisper…
                </p>
              )}
              {stage === "parsing" && (
                <p className="text-center text-xs text-muted-foreground">
                  Extracting items with Claude…
                </p>
              )}
              {error && (
                <p className="text-center text-xs text-destructive">{error}</p>
              )}
            </CardContent>
          </Card>

          {transcript && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm italic text-muted-foreground">
                  &ldquo;{transcript}&rdquo;
                </p>
              </CardContent>
            </Card>
          )}

          {notices.length > 0 && (
            <div
              role="status"
              className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
            >
              {notices.map((notice) => (
                <p key={notice} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{notice}</span>
                </p>
              ))}
            </div>
          )}

          {hasItems && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Items ({approvedCount} approved · {pendingCount} pending
                  {savedCount > 0 ? ` · ${savedCount} saved` : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rows.map((row, i) => (
                  <ParsedItemRow
                    key={row.id}
                    index={i}
                    item={row.item}
                    approved={row.approved}
                    notes={row.notes}
                    // A row already written by an earlier partial commit is
                    // locked: leaving it interactive made it a dead end, since
                    // toggling or editing it could no longer change what was
                    // saved.
                    disabled={stage === "saving" || row.saved || row.refreshing}
                    refreshing={row.refreshing}
                    {...(isRefreshable(row.item) && {
                      onRefresh: () => void refreshRow(row),
                    })}
                    {...medicationRowProps(row, i)}
                    onChange={(next) => updateRow(i, { item: next })}
                    onApprove={() =>
                      updateRow(i, {
                        approved: row.approved === true ? null : true,
                      })
                    }
                    onReject={() =>
                      updateRow(i, {
                        approved: row.approved === false ? null : false,
                      })
                    }
                  />
                ))}

                {reasoning && (
                  <p className="rounded border-l-2 border-muted-foreground/30 bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground">
                    {reasoning}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Action bar — pinned to bottom of the sheet body */}
      {hasItems && (
        <div className="-mx-6 -mb-6 shrink-0 border-t bg-background/95 px-3 pt-3 backdrop-blur-sm"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex">
            <Button
              size="lg"
              className="flex-1 gap-2 rounded-r-none bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
              disabled={stage === "saving" || pendingCount === 0}
              onClick={rejectAll}
            >
              <X className="h-5 w-5" />
              Reject all
            </Button>
            <Button
              size="lg"
              className="flex-1 gap-2 rounded-l-none bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600"
              disabled={stage === "saving" || pendingCount === 0}
              onClick={approveAll}
            >
              <Check className="h-5 w-5" />
              Approve all
            </Button>
          </div>
          <Button
            size="lg"
            className="mt-3 w-full gap-2"
            disabled={stage === "saving" || anyRefreshing || approvedCount === 0}
            onClick={commit}
          >
            <Check className="h-5 w-5" />
            Save {approvedCount > 0 ? approvedCount : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
