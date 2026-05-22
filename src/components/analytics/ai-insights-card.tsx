"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  useGenerateInsights,
  useInsightReports,
  NotEnoughDataError,
} from "@/hooks/use-insights";
import { useUserProfile } from "@/hooks/use-profile-queries";
import { insightsRange, INSIGHTS_WINDOW_DAYS } from "@/lib/analytics-snapshot";
import type { InsightReport } from "@/lib/db";

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

/** Render one cached report's narrative + observations. */
function ReportBody({ report }: { report: InsightReport }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700 dark:text-slate-200">
        {report.narrative}
      </p>
      {report.observations.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {report.observations.map((observation, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden className="text-violet-500">
                &bull;
              </span>
              <span>{observation}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * On-demand AI summary of the last 30 days of tracked data. Generation is
 * user-triggered (a button); every result is cached to IndexedDB so past
 * assessments survive reloads and sync across devices. Before generating, a
 * dialog spells out exactly what data feeds the analysis.
 */
export function AiInsightsCard() {
  const waterGoalMl = useSettingsStore((s) => s.waterLimit);
  const sodiumLimitMg = useSettingsStore((s) => s.saltLimit);
  const sugarLimitG = useSettingsStore((s) => s.sugarLimit);
  const reports = useInsightReports();
  const profile = useUserProfile();
  const { toast } = useToast();
  const { mutate, isPending } = useGenerateInsights();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [includePrevious, setIncludePrevious] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const latest = reports[0] ?? null;
  const history = reports.slice(1);
  const hasPrevious = reports.length > 0;

  const shareConditions =
    profile.shareConditionsWithAI && profile.conditions.length > 0;
  const shareMedications = profile.shareMedicationsWithAI;
  const personalised = shareConditions || shareMedications;

  const openConfirm = () => {
    // Only meaningful when a prior report exists to compare against.
    setIncludePrevious(false);
    setConfirmOpen(true);
  };

  const generate = () => {
    setConfirmOpen(false);
    mutate(
      {
        range: insightsRange(),
        goals: { waterGoalMl, sodiumLimitMg, sugarLimitG },
        ...(shareConditions && { conditions: profile.conditions }),
        ...(shareMedications && { includeMedications: true }),
        ...(includePrevious && hasPrevious && { includePrevious: true }),
      },
      {
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
        {latest ? (
          <div className="space-y-2">
            <ReportBody report={latest} />
            <p className="text-xs text-muted-foreground">
              Generated{" "}
              {formatDistanceToNow(latest.generatedAt, { addSuffix: true })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate an AI summary of your last {INSIGHTS_WINDOW_DAYS} days of
            tracked data.
          </p>
        )}

        <Button
          variant={latest ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={openConfirm}
          disabled={isPending}
        >
          {isPending
            ? "Analysing…"
            : latest
              ? "Regenerate"
              : "Generate insights"}
        </Button>

        {personalised && (
          <p className="text-[11px] text-muted-foreground">
            Personalised with your medical profile.
          </p>
        )}

        {history.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span>
                  Previous summaries ({history.length})
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    historyOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {history.map((report) => (
                <div
                  key={report.id}
                  className="space-y-1 border-t border-slate-200 dark:border-slate-800 pt-2"
                >
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(report.generatedAt, {
                      addSuffix: true,
                    })}
                  </p>
                  <ReportBody report={report} />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
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

            {hasPrevious && (
              <div className="space-y-1.5">
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  Compare with history
                </p>
                <label className="flex gap-2 text-slate-600 dark:text-slate-300">
                  <Checkbox
                    className="mt-0.5"
                    checked={includePrevious}
                    onCheckedChange={(checked) =>
                      setIncludePrevious(checked === true)
                    }
                  />
                  <span>
                    Include my previous summary so the AI can describe what
                    changed since then.
                  </span>
                </label>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Only aggregated numbers are sent — individual entries, notes, and
              timestamps never leave your device.
              {includePrevious && hasPrevious
                ? " The text of your previous summary is sent too, so the AI can compare periods."
                : ""}
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
              {latest ? "Regenerate" : "Generate insights"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
