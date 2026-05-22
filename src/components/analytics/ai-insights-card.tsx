"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/stores/settings-store";
import { useInsightsStore } from "@/stores/insights-store";
import { useGenerateInsights, NotEnoughDataError } from "@/hooks/use-insights";
import { useUserProfile } from "@/hooks/use-profile-queries";
import { insightsRange, INSIGHTS_WINDOW_DAYS } from "@/lib/analytics-snapshot";

/**
 * Tracked-data domains that can feed the rolling-window analysis. Each is
 * included by `buildAnalyticsSnapshot` only when the window holds enough data
 * for it, so the dialog frames them as conditional rather than guaranteed.
 */
const TRACKED_DATA = [
  "Water intake",
  "Salt / sodium intake",
  "Sugar intake",
  "Blood pressure readings",
  "Weight readings",
  "Fluid balance (in vs. out)",
  "Correlations: salt vs. weight, sugar vs. weight, caffeine & alcohol vs. blood pressure",
  "Your water goal, sodium limit & sugar limit",
];

/**
 * On-demand AI summary of the last 30 days of tracked data. Generation is
 * user-triggered (a button) and the latest result is cached locally. Before
 * generating, a dialog spells out exactly what data feeds the analysis.
 */
export function AiInsightsCard() {
  const waterGoalMl = useSettingsStore((s) => s.waterLimit);
  const sodiumLimitMg = useSettingsStore((s) => s.saltLimit);
  const sugarLimitG = useSettingsStore((s) => s.sugarLimit);
  const lastResult = useInsightsStore((s) => s.lastResult);
  const setResult = useInsightsStore((s) => s.setResult);
  const profile = useUserProfile();
  const { toast } = useToast();
  const { mutate, isPending } = useGenerateInsights();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const shareConditions =
    profile.shareConditionsWithAI && profile.conditions.length > 0;
  const shareMedications = profile.shareMedicationsWithAI;
  const personalised = shareConditions || shareMedications;

  const generate = () => {
    setConfirmOpen(false);
    mutate(
      {
        range: insightsRange(),
        goals: { waterGoalMl, sodiumLimitMg, sugarLimitG },
        ...(shareConditions && { conditions: profile.conditions }),
        ...(shareMedications && { includeMedications: true }),
      },
      {
        onSuccess: setResult,
        onError: (error) => {
          toast({
            title:
              error instanceof NotEnoughDataError
                ? "Not enough data"
                : "Couldn't generate insights",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {lastResult ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {lastResult.narrative}
            </p>
            {lastResult.observations.length > 0 && (
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {lastResult.observations.map((observation, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden className="text-violet-500">
                      &bull;
                    </span>
                    <span>{observation}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Generated{" "}
              {formatDistanceToNow(lastResult.generatedAt, { addSuffix: true })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate an AI summary of your last {INSIGHTS_WINDOW_DAYS} days of
            tracked data.
          </p>
        )}

        <Button
          variant={lastResult ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
        >
          {isPending
            ? "Analysing…"
            : lastResult
              ? "Regenerate"
              : "Generate insights"}
        </Button>

        {personalised && (
          <p className="text-[11px] text-muted-foreground">
            Personalised with your medical profile.
          </p>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-500" />
              What goes into this summary
            </DialogTitle>
            <DialogDescription>
              The AI analyses the last {INSIGHTS_WINDOW_DAYS} days of your
              tracked data. Here&apos;s exactly what&apos;s included.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1.5">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Tracked data (last {INSIGHTS_WINDOW_DAYS} days)
              </p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                {TRACKED_DATA.map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Each is included only when the window holds enough data for it.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Your medical profile
              </p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                <li className="flex gap-1.5">
                  {shareConditions ? (
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                  )}
                  <span>
                    {shareConditions ? (
                      <>
                        Conditions included:{" "}
                        <span className="text-slate-700 dark:text-slate-200">
                          {profile.conditions.join(", ")}
                        </span>
                      </>
                    ) : (
                      "Conditions not included — turn on sharing in your Profile to personalise the summary"
                    )}
                  </span>
                </li>
                <li className="flex gap-1.5">
                  {shareMedications ? (
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                  )}
                  <span>
                    {shareMedications
                      ? "Medications included — your active prescriptions, doses, and titration/maintenance phases"
                      : "Medications not included — turn on sharing in your Profile to add prescription context"}
                  </span>
                </li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              Only aggregated numbers are sent — individual entries, notes, and
              timestamps never leave your device.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={generate} disabled={isPending}>
              {lastResult ? "Regenerate" : "Generate insights"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
