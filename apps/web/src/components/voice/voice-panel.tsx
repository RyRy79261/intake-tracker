"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Mic, X } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@intake/ui/card";
import { useToast } from "@intake/ui/use-toast";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { ParsedItemRow } from "@/components/voice/parsed-item-row";
import { useAddIntake } from "@/hooks/use-intake-queries";
import { useAddWeight, useAddBloodPressure } from "@/hooks/use-health-queries";
import { useAddUrination } from "@/hooks/use-urination-queries";
import { useAddDefecation } from "@/hooks/use-defecation-queries";
import { useAddSubstance } from "@/hooks/use-substance-queries";
import { useLogDrink } from "@/hooks/use-drink-log";
import { useAddComposableEntry, type ComposableEntryInput } from "@/hooks/use-composable-entry";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import type { VoiceParsedItem, VoiceParseResponse } from "@/lib/voice-types";
import { reconcileLiquidItems } from "@/lib/voice-reconcile";
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
};

interface VoicePanelProps {
  /** Called once a save commit succeeds so the host can close the modal. */
  onCommitted?: () => void;
}

export function VoicePanel({ onCommitted }: VoicePanelProps) {
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

  const [transcript, setTranscript] = useState<string>("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [stage, setStage] = useState<"idle" | "transcribing" | "parsing" | "ready" | "saving">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);

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
      setError(null);
      setRows([]);
      setTranscript("");
      setReasoning(null);
      setStage("transcribing");

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
          body: JSON.stringify({ transcript: text }),
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
        const { items, merges, warnings } = reconcileLiquidItems(data.items);
        setRows(items.map((item) => ({ item, approved: null, saved: false })));
        setReasoning(
          [data.reasoning, ...merges, ...warnings].filter(Boolean).join(" ") ||
            null,
        );
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
    [toast]
  );

  const updateRow = useCallback((index: number, next: Partial<RowState>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...next } : r)));
  }, []);

  const approveAll = useCallback(() => {
    setRows((prev) => prev.map((r) => (r.approved === null ? { ...r, approved: true } : r)));
  }, []);

  const rejectAll = useCallback(() => {
    setRows((prev) => prev.map((r) => (r.approved === null ? { ...r, approved: false } : r)));
  }, []);

  const reset = useCallback(() => {
    setRows([]);
    setTranscript("");
    setReasoning(null);
    setError(null);
    setStage("idle");
  }, []);

  const saveItem = useCallback(
    async (item: VoiceParsedItem) => {
      switch (item.kind) {
        case "blood_pressure":
          await addBloodPressure.mutateAsync({
            systolic: item.systolic,
            diastolic: item.diastolic,
            position: item.position ?? "sitting",
            arm: item.arm ?? "left",
            ...(item.heartRate !== undefined && { heartRate: item.heartRate }),
            note: item.note ?? "voice",
          });
          break;
        case "weight":
          await addWeight.mutateAsync({
            weight: item.weightKg,
            note: item.note ?? "voice",
          });
          break;
        case "water":
          await addIntake.mutateAsync({
            type: "water",
            amount: item.ml,
            source: "voice",
            ...(item.note !== undefined && { note: item.note }),
          });
          break;
        case "salt":
          await addIntake.mutateAsync({
            type: "salt",
            amount: item.sodiumMg,
            source: "voice",
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
          });
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
              });
            } else {
              await addSubstance({
                type: "caffeine",
                amountMg: item.caffeineMg,
                description: item.description,
              });
            }
          }
          break;
        case "alcohol":
          await logDrinkEntry({
            volumeMl: item.volumeMl,
            description: item.description,
            abvPercent: item.abvPercent,
            ...(item.sugarG !== undefined && sugarEnabled && { sugarG: item.sugarG }),
            ...(item.sodiumMg !== undefined && { saltMg: item.sodiumMg }),
            ...(item.potassiumMg !== undefined &&
              potassiumEnabled && { potassiumMg: item.potassiumMg }),
            waterSource: "voice",
            groupSource: "voice_drink",
          });
          break;
        case "urination":
          await addUrination.mutateAsync({
            ...(item.amountEstimate !== undefined && {
              amountEstimate: item.amountEstimate,
            }),
            note: item.note ?? "voice",
          });
          break;
        case "defecation":
          await addDefecation.mutateAsync({
            ...(item.amountEstimate !== undefined && {
              amountEstimate: item.amountEstimate,
            }),
            note: item.note ?? "voice",
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
    let successCount = 0;
    const failures: string[] = [];
    const savedIndices: number[] = [];

    for (const { row, index } of pending) {
      const { item } = row;
      try {
        await saveItem(item);
        successCount++;
        savedIndices.push(index);
      } catch (e) {
        let saveError: unknown = e;
        if (await recoverClosedDatabase(e)) {
          // The browser severed the IndexedDB connection out from under us
          // (storage eviction / backing-store loss — issue #287). The DB has
          // been reopened; retry this item once before declaring it failed.
          try {
            await saveItem(item);
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
