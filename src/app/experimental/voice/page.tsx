"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, X, Sparkles } from "lucide-react";
import { AuthGuard, useAuth } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { VoiceRecorder } from "@/components/experimental/voice-recorder";
import { ParsedItemRow } from "@/components/experimental/parsed-item-row";
import { useAddIntake } from "@/hooks/use-intake-queries";
import { useAddEating } from "@/hooks/use-eating-queries";
import { useAddWeight, useAddBloodPressure } from "@/hooks/use-health-queries";
import { useAddUrination } from "@/hooks/use-urination-queries";
import { useAddDefecation } from "@/hooks/use-defecation-queries";
import { useAddSubstance } from "@/hooks/use-substance-queries";
import type { VoiceParsedItem, VoiceParseResponse } from "@/lib/voice-types";
import { useQueryClient } from "@tanstack/react-query";

type RowState = { item: VoiceParsedItem; approved: boolean | null };

function ExperimentalVoiceContent() {
  const router = useRouter();
  const { toast } = useToast();
  const settings = useSettings();
  const { getAuthHeader } = useAuth();
  const queryClient = useQueryClient();

  const addIntake = useAddIntake();
  const addEating = useAddEating();
  const addWeight = useAddWeight();
  const addBloodPressure = useAddBloodPressure();
  const addUrination = useAddUrination();
  const addDefecation = useAddDefecation();
  const addSubstance = useAddSubstance();

  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const enabled = settings.experimentalFeatures?.voiceHealthMetrics ?? false;

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
  const approvedCount = useMemo(
    () => rows.filter((r) => r.approved === true).length,
    [rows]
  );

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      setError(null);
      setRows([]);
      setTranscript("");
      setReasoning(null);
      setStage("transcribing");

      try {
        const auth = await getAuthHeader();
        const ext =
          mimeType.includes("mp4") || mimeType.includes("aac")
            ? "m4a"
            : mimeType.includes("ogg")
              ? "ogg"
              : "webm";

        const form = new FormData();
        form.append("audio", blob, `clip.${ext}`);

        const transcribeRes = await fetch("/api/ai/voice-transcribe", {
          method: "POST",
          headers: auth,
          body: form,
        });
        if (!transcribeRes.ok) {
          const j = await transcribeRes.json().catch(() => ({}));
          throw new Error(j.error || `Transcribe failed (${transcribeRes.status})`);
        }
        const { text } = (await transcribeRes.json()) as { text: string };
        setTranscript(text);

        setStage("parsing");
        const parseRes = await fetch("/api/ai/voice-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({ transcript: text }),
        });
        if (!parseRes.ok) {
          const j = await parseRes.json().catch(() => ({}));
          throw new Error(j.error || `Parse failed (${parseRes.status})`);
        }
        const data = (await parseRes.json()) as VoiceParseResponse;
        setRows(data.items.map((item) => ({ item, approved: null })));
        setReasoning(data.reasoning ?? null);
        setStage("ready");

        if (data.items.length === 0) {
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
    [getAuthHeader, toast]
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

  const commit = useCallback(async () => {
    const approved = rows.filter((r) => r.approved === true).map((r) => r.item);
    if (approved.length === 0) return;

    setStage("saving");
    const groupId = crypto.randomUUID();
    let successCount = 0;
    const failures: string[] = [];

    for (const item of approved) {
      try {
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
            const eating = await addEating.mutateAsync({
              note: item.description,
              ...(item.grams !== undefined && { grams: item.grams }),
            });
            if (item.waterMl && item.waterMl > 0) {
              await addIntake.mutateAsync({
                type: "water",
                amount: item.waterMl,
                source: `voice:food:${eating.id}`,
                note: item.description,
              });
            }
            if (item.sodiumMg && item.sodiumMg > 0) {
              await addIntake.mutateAsync({
                type: "salt",
                amount: item.sodiumMg,
                source: `voice:food:${eating.id}`,
                note: item.description,
              });
            }
            break;
          }
          case "caffeine":
            await addSubstance({
              type: "caffeine",
              amountMg: item.caffeineMg,
              ...(item.volumeMl !== undefined && { volumeMl: item.volumeMl }),
              description: item.description,
            });
            break;
          case "alcohol":
            await addSubstance({
              type: "alcohol",
              amountStandardDrinks: item.standardDrinks,
              ...(item.volumeMl !== undefined && { volumeMl: item.volumeMl }),
              description: item.description,
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
        successCount++;
      } catch (e) {
        failures.push(`${item.kind}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // Invalidate everything that may have changed; cheap because all reads
    // are local Dexie queries.
    void queryClient.invalidateQueries();

    toast({
      title: `Saved ${successCount} of ${approved.length}`,
      description: failures.length
        ? `Failures: ${failures.slice(0, 3).join("; ")}`
        : `Group ${groupId.slice(0, 8)}`,
      variant: failures.length ? "destructive" : "default",
    });

    reset();
  }, [
    rows,
    toast,
    reset,
    queryClient,
    addIntake,
    addEating,
    addWeight,
    addBloodPressure,
    addUrination,
    addDefecation,
    addSubstance,
  ]);

  if (!enabled) {
    return (
      <>
        <AppHeader headerHidden={isHidden} transitionDuration={barTransitionSec} />
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              Experimental feature disabled
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Voice health metrics is an experimental feature. Enable it in
              Settings → Experimental.
            </p>
            <Button onClick={() => router.push("/settings")} className="w-full">
              Open Settings
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <AppHeader headerHidden={isHidden} transitionDuration={barTransitionSec} />

      <div className="space-y-4 pb-24">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/settings")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Settings
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Experimental
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Voice health metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

        {rows.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">
                Items ({approvedCount} approved · {pendingCount} pending)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row, i) => (
                <ParsedItemRow
                  key={i}
                  index={i}
                  item={row.item}
                  approved={row.approved}
                  disabled={stage === "saving"}
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

      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-lg gap-2 p-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1 gap-2"
              disabled={stage === "saving"}
              onClick={rejectAll}
            >
              <X className="h-5 w-5" />
              Reject all
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-1 gap-2"
              disabled={stage === "saving" || pendingCount === 0}
              onClick={approveAll}
            >
              <Check className="h-5 w-5" />
              Approve all
            </Button>
            <Button
              size="lg"
              className="flex-1 gap-2"
              disabled={stage === "saving" || approvedCount === 0}
              onClick={commit}
            >
              <Check className="h-5 w-5" />
              Save {approvedCount > 0 ? approvedCount : ""}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function ExperimentalVoicePage() {
  return (
    <AuthGuard>
      <ExperimentalVoiceContent />
    </AuthGuard>
  );
}
