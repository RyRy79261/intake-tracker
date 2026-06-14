"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
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
  useDeepInsightJob,
  NotEnoughDataError,
} from "@/hooks/use-insights";
import { useUserProfile } from "@/hooks/use-profile-queries";
import { insightsRange, INSIGHTS_WINDOW_DAYS } from "@/lib/analytics-snapshot";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import type { InsightReport } from "@/lib/db";

/**
 * Wall-clock minutes between job start and "this is taking longer than
 * usual" wording change. Typical deep batches finish well under this.
 */
const DEEP_LONG_RUN_THRESHOLD_MS = 15 * 60 * 1000;

// Tracked-data list is built inside the component because it depends on the
// user's enabled optional trackers. Each item is included by
// `buildAnalyticsSnapshot` only when the window holds enough data for it, so
// the dialog frames them as conditional rather than guaranteed.

/**
 * Best-effort hostname pretty-print for a source URL. Falls back to the
 * raw string when the input cannot be parsed (e.g. shortened pre-validated
 * forms from older reports).
 */
function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // URL.hostname is empty for schemes like `javascript:` or `data:`.
    // Fall back to the raw URL so the user still sees something — and
    // the XSS guard downstream keeps it from being clickable.
    return host || url;
  } catch {
    return url;
  }
}

/**
 * Anchor-safety guard: `z.url()` accepts `javascript:` and `data:`
 * schemes, which we would NEVER want to render as a clickable link given
 * the URL is model-generated. Only http(s) survives as an anchor; anything
 * else falls back to plain text so the source still shows but cannot be
 * activated.
 */
function isSafeHref(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function SourceLink({ url }: { url: string }) {
  const label = sourceLabel(url);
  if (!isSafeHref(url)) {
    return (
      <span
        className="text-muted-foreground"
        title={`Unsafe URL scheme: ${url}`}
      >
        {label}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-violet-600 dark:text-violet-400 hover:underline"
      title={url}
    >
      {label}
    </a>
  );
}

/**
 * Compact one-row teaser for a cached report — relative timestamp, mode
 * badge, a clipped narrative snippet, and a "Read report" affordance.
 * Tapping anywhere on the row hands the full report to the parent so it
 * can swap it into the reading dialog. Keeps the card scannable when a
 * deep-mode report would otherwise dominate the analytics page.
 */
function ReportPreview({
  report,
  onOpen,
}: {
  report: InsightReport;
  onOpen: (report: InsightReport) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(report)}
      className="w-full text-left rounded-md border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors px-2.5 py-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-muted-foreground truncate">
            {formatDistanceToNow(report.generatedAt, { addSuffix: true })}
          </span>
          {report.mode === "deep" && (
            <span
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-[10px] font-medium"
              title="Deep analysis with web search"
            >
              <Search className="w-2.5 h-2.5" />
              Deep
            </span>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          Read
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
        {report.narrative}
      </p>
    </button>
  );
}

/** Full report contents — narrative + observations + sources. Rendered
 * inside the reading dialog; intentionally not constrained in height so
 * the dialog's own scroll container handles overflow. */
function ReportContent({ report }: { report: InsightReport }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">
        {report.narrative}
      </p>
      {report.observations.length > 0 && (
        <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
          {report.observations.map((observation, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden className="text-violet-500 leading-5">
                &bull;
              </span>
              <span>{observation}</span>
            </li>
          ))}
        </ul>
      )}
      {report.sources && report.sources.length > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Sources
          </p>
          <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
            {report.sources.map((url, i) => (
              <li key={i}>
                <SourceLink url={url} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * On-demand AI summary of the last 30 days of tracked data. Two flavours:
 *
 *   • Fast analysis — synchronous Sonnet summary, returns in ~10s.
 *   • Deep analysis — Opus + web search, submitted as an Anthropic batch.
 *     Returns minutes later; the user can close the page and come back.
 *
 * Every result is cached to IndexedDB so past assessments survive reloads
 * and sync across devices. Before generating, a dialog spells out exactly
 * what data feeds the analysis and surfaces the cost warning for deep mode.
 */
export function AiInsightsCard() {
  const waterGoalMl = useSettingsStore((s) => s.waterLimit);
  const sodiumLimitMg = useSettingsStore((s) => s.saltLimit);
  const sugarLimitG = useSettingsStore((s) => s.sugarLimit);
  const potassiumLimitMg = useSettingsStore((s) => s.potassiumLimit);
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");

  // Build the tracked-data list dynamically — disabled optional trackers
  // shouldn't claim to feed the AI summary because they aren't included
  // in the snapshot the route receives.
  const trackedData = [
    "Water intake",
    "Salt / sodium intake",
    ...(sugarEnabled ? ["Sugar intake"] : []),
    ...(potassiumEnabled ? ["Potassium intake"] : []),
    "Blood pressure readings",
    "Weight readings",
    "Fluid balance (in vs. out)",
    `Correlations: salt vs. weight${sugarEnabled ? ", sugar vs. weight" : ""}` +
      `${potassiumEnabled ? ", potassium vs. weight" : ""}, caffeine & alcohol vs. blood pressure`,
    `Your water goal, sodium limit${sugarEnabled ? ", sugar limit" : ""}` +
      `${potassiumEnabled ? " & potassium target" : ""}`,
  ];
  const reports = useInsightReports();
  const profile = useUserProfile();
  const { toast } = useToast();
  const { mutate, isPending: fastPending } = useGenerateInsights();
  const deep = useDeepInsightJob();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"fast" | "deep">("fast");
  const [includePrevious, setIncludePrevious] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The report currently being read in the dedicated reading dialog. null
  // when the dialog is closed.
  const [readingReport, setReadingReport] = useState<InsightReport | null>(
    null,
  );
  // Recompute "long-running" wording each minute while a deep job is pending
  // so the message swaps without a refresh once the threshold is crossed.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (deep.state.status !== "pending") return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [deep.state.status]);

  const latest = reports[0] ?? null;
  const history = reports.slice(1);
  const hasPrevious = reports.length > 0;

  const shareConditions =
    profile.shareConditionsWithAI && profile.conditions.length > 0;
  const shareMedications = profile.shareMedicationsWithAI;
  const personalised = shareConditions || shareMedications;

  const pendingState =
    deep.state.status === "pending" ? deep.state : null;
  const deepLongRunning =
    pendingState !== null &&
    Date.now() - pendingState.startedAt > DEEP_LONG_RUN_THRESHOLD_MS;
  const deepBusy =
    deep.state.status === "submitting" || deep.state.status === "pending";

  const openConfirm = (mode: "fast" | "deep") => {
    setDialogMode(mode);
    // Only meaningful when a prior report exists to compare against.
    setIncludePrevious(false);
    setConfirmOpen(true);
  };

  const generate = () => {
    setConfirmOpen(false);
    const payload = {
      range: insightsRange(),
      goals: { waterGoalMl, sodiumLimitMg, sugarLimitG, potassiumLimitMg },
      enabledTrackers: { sugar: sugarEnabled, potassium: potassiumEnabled },
      ...(shareConditions && { conditions: profile.conditions }),
      ...(shareMedications && { includeMedications: true }),
      ...(includePrevious && hasPrevious && { includePrevious: true }),
    };

    if (dialogMode === "deep") {
      deep.submit(payload).catch((error: Error) => {
        toast({
          title:
            error instanceof NotEnoughDataError
              ? "Not enough data"
              : "Couldn't start deep analysis",
          description: error.message,
          variant: "destructive",
        });
      });
      return;
    }

    mutate(payload, {
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
    });
  };

  // Surface deep completion / failure with a toast and clear the hook's
  // sticky state so subsequent runs start clean. The result itself lands in
  // the Dexie cache via the sync pull triggered by the hook, so the card's
  // live query renders it automatically — no special "fresh result" pane.
  useEffect(() => {
    if (deep.state.status === "completed") {
      toast({
        title: "Deep analysis ready",
        description: "Your deep-research insight is now in the summary.",
      });
      deep.reset();
    } else if (deep.state.status === "failed" || deep.state.status === "expired") {
      toast({
        title:
          deep.state.status === "expired"
            ? "Deep analysis timed out"
            : "Deep analysis failed",
        description: deep.state.error,
        variant: "destructive",
      });
      deep.reset();
    }
    // `deep` itself is a fresh object every render — only re-run when status
    // transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deep.state.status]);

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
          <ReportPreview report={latest} onOpen={setReadingReport} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate an AI summary of your last {INSIGHTS_WINDOW_DAYS} days of
            tracked data.
          </p>
        )}

        {pendingState && (
          <div className="flex items-start gap-2 rounded-md border border-violet-200 dark:border-violet-900/60 bg-violet-50/70 dark:bg-violet-950/30 px-2.5 py-2 text-xs">
            <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500 animate-spin" />
            <div className="space-y-0.5">
              <p className="font-medium text-violet-900 dark:text-violet-200">
                Deep analysis in progress
              </p>
              <p className="text-violet-800/80 dark:text-violet-300/80">
                Started{" "}
                {formatDistanceToNow(pendingState.startedAt, { addSuffix: true })}.{" "}
                {deepLongRunning
                  ? "Taking longer than usual — still working in the background, you can keep this open or come back later."
                  : "You can close this and come back; the report will appear here when it's ready."}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={latest ? "outline" : "default"}
            size="sm"
            onClick={() => openConfirm("fast")}
            disabled={fastPending || deep.state.status === "submitting"}
          >
            {fastPending ? "Analysing…" : "Fast analysis"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openConfirm("deep")}
            disabled={deepBusy || fastPending}
            className="gap-1.5"
          >
            {deep.state.status === "submitting" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Submitting…
              </>
            ) : pendingState ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                In progress
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                Deep analysis
              </>
            )}
          </Button>
        </div>

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
            <CollapsibleContent className="space-y-2 pt-2">
              {history.map((report) => (
                <ReportPreview
                  key={report.id}
                  report={report}
                  onOpen={setReadingReport}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {dialogMode === "deep" ? (
                <Search className="w-4 h-4 text-violet-500" />
              ) : (
                <Sparkles className="w-4 h-4 text-violet-500" />
              )}
              {dialogMode === "deep"
                ? "Deep analysis with web research"
                : "What goes into this summary"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "deep"
                ? `Opus 4.6 reviews your last ${INSIGHTS_WINDOW_DAYS} days of data and consults web sources for clinical context. Here's exactly what's included.`
                : `The AI analyses the last ${INSIGHTS_WINDOW_DAYS} days of your tracked data. Here's exactly what's included.`}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === "deep" && (
            <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-medium">Deep analysis is a costly request</p>
              <p>
                It runs a more powerful model with web search against current
                clinical references — typically 3-10 minutes and roughly
                10-20× the cost of a fast summary. You can close this and come
                back; the report will appear here when it&apos;s ready.
              </p>
            </div>
          )}

          <div className="space-y-3 text-sm">
            <div className="space-y-1.5">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Tracked data (last {INSIGHTS_WINDOW_DAYS} days)
              </p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                {trackedData.map((item) => (
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
            <Button
              size="sm"
              onClick={generate}
              disabled={
                dialogMode === "deep"
                  ? deepBusy
                  : fastPending
              }
            >
              {dialogMode === "deep"
                ? "Start deep analysis"
                : latest
                  ? "Regenerate"
                  : "Generate insights"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={readingReport !== null}
        onOpenChange={(open) => {
          if (!open) setReadingReport(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-500" />
              AI insights report
              {readingReport?.mode === "deep" && (
                <span
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-[10px] font-medium"
                  title="Deep analysis with web search"
                >
                  <Search className="w-2.5 h-2.5" />
                  Deep
                </span>
              )}
            </DialogTitle>
            {readingReport && (
              <DialogDescription>
                Generated{" "}
                {formatDistanceToNow(readingReport.generatedAt, {
                  addSuffix: true,
                })}
                .
              </DialogDescription>
            )}
          </DialogHeader>
          {readingReport && (
            <div className="overflow-y-auto pr-1 -mr-1">
              <ReportContent report={readingReport} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
