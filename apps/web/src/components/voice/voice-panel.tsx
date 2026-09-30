"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Mic, X } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@intake/ui/card";
import { useToast } from "@intake/ui/use-toast";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { ParsedItemRow, type ParsedItemNote } from "@/components/voice/parsed-item-row";
import { useAddIntake } from "@/hooks/use-intake-queries";
import { useAddWeight, useAddBloodPressure } from "@/hooks/use-health-queries";
import { useAddUrination } from "@/hooks/use-urination-queries";
import { useAddDefecation } from "@/hooks/use-defecation-queries";
import { useAddSubstance } from "@/hooks/use-substance-queries";
import { useLogDrink } from "@/hooks/use-drink-log";
import { waterContentPercentFromAbv } from "@intake/core/alcohol";
import { useAddComposableEntry, type ComposableEntryInput } from "@/hooks/use-composable-entry";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import type { VoiceParsedItem, VoiceParseResponse } from "@/lib/voice-types";
import { reconcileLiquidItems } from "@/lib/voice-reconcile";
import { applyPresetCaffeine } from "@/lib/voice-presets";
import { validateVoiceItem } from "@/lib/voice-validation";
import {
  clientNowForParse,
  isLongAgo,
  normalizeSpokenTiming,
  spokenTimestamp,
} from "@/lib/voice-time";
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";
import { recoverClosedDatabase } from "@/lib/db";
import { apiFetch } from "@/lib/api-fetch";
import { useQueryClient } from "@tanstack/react-query";

type RowState = {
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
};

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

  const addIntake = useAddIntake();
  const addWeight = useAddWeight();
  const addBloodPressure = useAddBloodPressure();
  const addUrination = useAddUrination();
  const addDefecation = useAddDefecation();
  const addSubstance = useAddSubstance();
  const logDrinkEntry = useLogDrink();
  const addComposableEntry = useAddComposableEntry();
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const liquidPresets = useSettingsStore((s) => s.liquidPresets);

  const [transcript, setTranscript] = useState<string>("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [stage, setStage] = useState<"idle" | "transcribing" | "parsing" | "ready" | "saving">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

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

        const transcribeRes = await apiFetch("/api/ai/voice-transcribe", {
          method: "POST",
          body: form,
        });
        if (!transcribeRes) {
          setStage("idle");
          return;
        }
        if (!transcribeRes.ok) {
          const j = await transcribeRes.json().catch(() => ({}));
          throw new Error(j.error || `Transcribe failed (${transcribeRes.status})`);
        }
        const { text } = (await transcribeRes.json()) as { text: string };
        setTranscript(text);

        setStage("parsing");
        const parseRes = await apiFetch("/api/ai/voice-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The device's clock goes with the transcript: the parser cannot
          // date "yesterday at 8pm" without knowing what today is here.
          body: JSON.stringify({
            transcript: text,
            now: clientNowForParse(spokenAt, timeZone),
          }),
        });
        if (!parseRes) {
          setStage("idle");
          return;
        }
        if (!parseRes.ok) {
          const j = await parseRes.json().catch(() => ({}));
          throw new Error(j.error || `Parse failed (${parseRes.status})`);
        }
        const data = (await parseRes.json()) as VoiceParseResponse;
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
          item,
          approved: null,
          saved: false,
          notes: [],
          flagged: false,
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

  // Skips rows that are flagged as a possible duplicate, fail validation, or
  // are dated more than a week back: those need the user's attention one at
  // a time.
  const approveAll = useCallback(() => {
    const now = Date.now();
    const timeZone = getDeviceTimezone();
    setRows((prev) =>
      prev.map((r) =>
        r.approved === null &&
        !r.flagged &&
        validateVoiceItem(r.item, now, timeZone) === null &&
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

  const saveItem = useCallback(
    async (item: VoiceParsedItem, timestamp: number) => {
      switch (item.kind) {
        case "blood_pressure":
          await addBloodPressure.mutateAsync({
            systolic: item.systolic,
            diastolic: item.diastolic,
            position: item.position ?? "sitting",
            arm: item.arm ?? "left",
            ...(item.heartRate !== undefined && { heartRate: item.heartRate }),
            ...(item.note !== undefined && { note: item.note }),
            source: "voice",
            timestamp,
          });
          break;
        case "weight":
          await addWeight.mutateAsync({
            weight: item.weightKg,
            ...(item.note !== undefined && { note: item.note }),
            source: "voice",
            timestamp,
          });
          break;
        case "water":
          await addIntake.mutateAsync({
            type: "water",
            amount: item.ml,
            source: "voice",
            timestamp,
            ...(item.note !== undefined && { note: item.note }),
          });
          break;
        case "salt":
          await addIntake.mutateAsync({
            type: "salt",
            amount: item.sodiumMg,
            source: "voice",
            timestamp,
            ...(item.note !== undefined && { note: item.note }),
          });
          break;
        case "food": {
          const intakes: ComposableEntryInput["intakes"] = [];
          if (item.waterMl && item.waterMl > 0) {
            intakes.push({
              type: "water",
              amount: item.waterMl,
              source: "manual:food_water_content",
              note: item.description,
            });
          }
          if (item.sodiumMg && item.sodiumMg > 0) {
            intakes.push({
              type: "salt",
              amount: item.sodiumMg,
              source: "manual:sodium",
              note: item.description,
            });
          }
          if (sugarEnabled && item.sugarG && item.sugarG > 0) {
            intakes.push({
              type: "sugar",
              amount: item.sugarG,
              source: "manual:sugar",
              note: item.description,
            });
          }
          if (potassiumEnabled && item.potassiumMg && item.potassiumMg > 0) {
            intakes.push({
              type: "potassium",
              amount: item.potassiumMg,
              source: "manual:potassium",
              note: item.description,
            });
          }
          await addComposableEntry({
            eating: {
              note: item.description,
              ...(item.grams !== undefined && { grams: item.grams }),
            },
            ...(intakes.length > 0 && { intakes }),
            groupSource: "ai_food_parse",
          }, timestamp);
          break;
        }
        case "caffeine":
          // A caffeinated drink goes through logDrink, which owns the fluid:
          // it writes exactly one water record from volumeMl and groups it
          // with the caffeine record. With no volume we record the dose only —
          // no hydration is invented, and the review row exposes the volume
          // field so the user can supply it.
          if (item.volumeMl !== undefined && item.volumeMl > 0) {
            await logDrinkEntry({
              volumeMl: item.volumeMl,
              description: item.description,
              caffeineMg: item.caffeineMg,
              ...(item.sugarG !== undefined && sugarEnabled && { sugarG: item.sugarG }),
              ...(item.sodiumMg !== undefined && { saltMg: item.sodiumMg }),
              ...(item.potassiumMg !== undefined &&
                potassiumEnabled && { potassiumMg: item.potassiumMg }),
              waterSource: "voice",
              groupSource: "voice_drink",
              timestamp,
            });
          } else {
            // No volume: record the dose and any solutes, but no water — the
            // group still ties them together. Routing this through addSubstance
            // alone silently dropped the item's sugar/sodium/potassium.
            const soluteIntakes: ComposableEntryInput["intakes"] = [];
            if (sugarEnabled && item.sugarG !== undefined && item.sugarG > 0) {
              soluteIntakes.push({
                type: "sugar",
                amount: Math.round(item.sugarG),
                source: "manual:sugar",
                note: item.description,
              });
            }
            if (item.sodiumMg !== undefined && item.sodiumMg > 0) {
              soluteIntakes.push({
                type: "salt",
                amount: Math.round(item.sodiumMg),
                source: "manual:sodium",
                note: item.description,
              });
            }
            if (
              potassiumEnabled &&
              item.potassiumMg !== undefined &&
              item.potassiumMg > 0
            ) {
              soluteIntakes.push({
                type: "potassium",
                amount: Math.round(item.potassiumMg),
                source: "manual:potassium",
                note: item.description,
              });
            }
            if (soluteIntakes.length > 0) {
              await addComposableEntry({
                substance: {
                  type: "caffeine",
                  amountMg: item.caffeineMg,
                  description: item.description,
                },
                intakes: soluteIntakes,
                groupSource: "voice_drink",
              }, timestamp);
            } else {
              await addSubstance({
                type: "caffeine",
                amountMg: item.caffeineMg,
                description: item.description,
                timestamp,
              });
            }
          }
          break;
        case "alcohol":
          await logDrinkEntry({
            volumeMl: item.volumeMl,
            description: item.description,
            abvPercent: item.abvPercent,
            // No measured water content from voice: book the non-alcohol
            // share as water (a 40% spirit hydrates 60% of its volume).
            waterContentPercent: waterContentPercentFromAbv(item.abvPercent),
            ...(item.sugarG !== undefined && sugarEnabled && { sugarG: item.sugarG }),
            ...(item.sodiumMg !== undefined && { saltMg: item.sodiumMg }),
            ...(item.potassiumMg !== undefined &&
              potassiumEnabled && { potassiumMg: item.potassiumMg }),
            waterSource: "voice",
            groupSource: "voice_drink",
            timestamp,
          });
          break;
        case "urination":
          await addUrination.mutateAsync({
            ...(item.amountEstimate !== undefined && {
              amountEstimate: item.amountEstimate,
            }),
            ...(item.note !== undefined && { note: item.note }),
            source: "voice",
            timestamp,
          });
          break;
        case "defecation":
          await addDefecation.mutateAsync({
            ...(item.amountEstimate !== undefined && {
              amountEstimate: item.amountEstimate,
            }),
            ...(item.note !== undefined && { note: item.note }),
            source: "voice",
            timestamp,
          });
          break;
      }
    },
    [
      addIntake,
      addComposableEntry,
      addWeight,
      addBloodPressure,
      addUrination,
      addDefecation,
      addSubstance,
      logDrinkEntry,
      sugarEnabled,
      potassiumEnabled,
    ]
  );

  const commit = useCallback(async () => {
    // Rows already written by an earlier partial commit are skipped, so
    // re-tapping Save after a failure retries only what actually failed.
    const pending = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.approved === true && !row.saved);
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
        await saveItem(item, timestampFor(item));
        successCount++;
        savedIndices.push(index);
      } catch (e) {
        let saveError: unknown = e;
        if (await recoverClosedDatabase(e)) {
          // The browser severed the IndexedDB connection out from under us
          // (storage eviction / backing-store loss — issue #287). The DB has
          // been reopened; retry this item once before declaring it failed.
          try {
            await saveItem(item, timestampFor(item));
            successCount++;
            savedIndices.push(index);
            continue;
          } catch (retryError) {
            saveError = retryError;
          }
        }
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
  }, [rows, toast, reset, queryClient, saveItem, onCommitted]);

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
                food, drinks, weight, anything. Stop, review the extracted items, then
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
                    key={i}
                    index={i}
                    item={row.item}
                    approved={row.approved}
                    notes={row.notes}
                    // A row already written by an earlier partial commit is
                    // locked: leaving it interactive made it a dead end, since
                    // toggling or editing it could no longer change what was
                    // saved.
                    disabled={stage === "saving" || row.saved}
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
            disabled={stage === "saving" || approvedCount === 0}
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
