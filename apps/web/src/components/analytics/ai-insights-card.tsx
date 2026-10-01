"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  ChevronDown,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { Button } from "@intake/ui/button";
import { Checkbox } from "@intake/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@intake/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { useToast } from "@intake/ui/use-toast";
import { useSettingsStore } from "@/stores/settings-store";
import {
  useGenerateInsights,
  useInsightReports,
  useDeepInsightJob,
  useSharedMedicationCount,
  usePreviousInsightReport,
  useDeleteInsightReport,
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
      className="wm-prev"
      style={AI_C}
    >
      <span className="wm-pt">
        <span className="truncate">
          {formatDistanceToNow(report.generatedAt, { addSuffix: true })}
        </span>
        {report.mode === "deep" && <DeepPill />}
        <span className="rd">Read ›</span>
      </span>
      <span className="wm-clamp">{report.narrative}</span>
    </button>
  );
}

const AI_C = { "--c": "hsl(var(--ai))" } as CSSProperties;

/** Outlined "Deep" marker for web-search reports. */
function DeepPill() {
  return (
    <span className="wm-pill" style={AI_C} title="Deep analysis with web search">
      <Search aria-hidden="true" />
      Deep
    </span>
  );
}

/** Full report contents — narrative + observations + sources. Rendered
 * inside the reading dialog; intentionally not constrained in height so
 * the dialog's own scroll container handles overflow. */
function ReportContent({ report }: { report: InsightReport }) {
  return (
    <div className="wm-dlg flex flex-col gap-3">
      <p className="text-sm text-foreground whitespace-pre-line">
        {report.narrative}
      </p>
      {report.observations.length > 0 && (
        <ul className="wm-bul">
          {report.observations.map((observation, i) => (
            <li key={i}>{observation}</li>
          ))}
        </ul>
      )}
      {report.sources && report.sources.length > 0 && (
        <div>
          <h3>Sources</h3>
          <ul className="wm-src">
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
 *   • Fast analysis — synchronous Sonnet summary, returned while the user
 *     waits.
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
    "Sodium intake",
    ...(sugarEnabled ? ["Sugar intake"] : []),
    ...(potassiumEnabled ? ["Potassium intake"] : []),
    "Blood pressure readings",
    "Weight readings",
    "Fluid balance (in vs. out)",
    `Correlations: sodium vs. weight${sugarEnabled ? ", sugar vs. weight" : ""}` +
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
  // Delete is two-tap: the first arms it, the second deletes.
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteReport = useDeleteInsightReport();
  const openReport = (report: InsightReport | null) => {
    setDeleteArmed(false);
    setReadingReport(report);
  };

  const deleteReadingReport = () => {
    if (!readingReport) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    // Soft delete through writeWithSync, so the removal syncs like any edit.
    deleteReport.mutate(readingReport.id, {
      onSuccess: () => {
        openReport(null);
        toast({ title: "Report deleted" });
      },
      onError: (error) => {
        toast({
          title: "Couldn't delete the report",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };
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

  const shareConditions =
    profile.shareConditionsWithAI && profile.conditions.length > 0;
  const shareMedications = profile.shareMedicationsWithAI;
  const sharedMedicationCount = useSharedMedicationCount(shareMedications);
  // What would actually be sent: medication sharing with no active
  // prescription sends nothing.
  const personalised =
    shareConditions || (sharedMedicationCount ?? 0) > 0;

  // Mirrors the hook's choice (useGenerateInsights / useDeepInsightJob): a
  // report for an earlier period, withheld when it is personalised and the
  // new request would not be.
  const previousReport = usePreviousInsightReport(
    reports,
    insightsRange().start,
  );
  const hasPrevious =
    previousReport !== null && (!previousReport.personalised || personalised);

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
  // sticky state so subsequent runs start clean. The hook has already written
  // the result into the Dexie cache, so the card's live query renders it
  // automatically — no special "fresh result" pane.
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
    <section className="wm-card" style={AI_C} aria-label="AI Insights">
      <h3 className="wm-ct">
        <Sparkles className="text-ai" aria-hidden="true" />
        AI Insights
        {/* Always its own rolling window, whatever range the tab shows. */}
        <span className="r">Last {INSIGHTS_WINDOW_DAYS} days</span>
      </h3>
      {latest ? (
        <ReportPreview report={latest} onOpen={openReport} />
      ) : (
        <p className="wm-p">
          Generate an AI summary of your last {INSIGHTS_WINDOW_DAYS} days of
          tracked data.
        </p>
      )}

      {pendingState && (
        <div className="wm-deep" role="status">
          <Spinner className="mt-0.5 shrink-0" />
          <div>
            <b>Deep analysis in progress</b>
            <p>
              Started{" "}
              {formatDistanceToNow(pendingState.startedAt, { addSuffix: true })}.{" "}
              {deepLongRunning
                ? "Taking longer than usual — still working in the background, you can keep this open or come back later."
                : "You can close this and come back; the report will appear here when it's ready."}
            </p>
          </div>
        </div>
      )}

      <div className="wm-g2">
        <Button
          variant={latest ? "outline" : "default"}
          onClick={() => openConfirm("fast")}
          disabled={fastPending || deep.state.status === "submitting"}
        >
          {fastPending ? (
            <>
              <Spinner />
              Analysing…
            </>
          ) : (
            "Fast analysis"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => openConfirm("deep")}
          disabled={deepBusy || fastPending}
        >
          {deep.state.status === "submitting" ? (
            <>
              <Spinner />
              Submitting…
            </>
          ) : pendingState ? (
            <>
              <Spinner />
              In progress
            </>
          ) : (
            <>
              <Search />
              Deep analysis
            </>
          )}
        </Button>
      </div>

      {personalised && (
        <p className="wm-note">Personalised with your medical profile.</p>
      )}

      {history.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="wm-hist">
          <CollapsibleTrigger asChild>
            <button type="button">
              Previous summaries ({history.length})
              <ChevronDown aria-hidden="true" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {history.map((report) => (
              <ReportPreview
                key={report.id}
                report={report}
                onOpen={openReport}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="wm-dialog wm-dlg w-[calc(100%-24px)] border-line max-w-sm" style={AI_C}>
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="wm-dh">
              {dialogMode === "deep" ? (
                <Search className="text-ai" aria-hidden="true" />
              ) : (
                <Sparkles className="text-ai" aria-hidden="true" />
              )}
              {dialogMode === "deep"
                ? "Deep analysis with web research"
                : "What goes into this summary"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "deep"
                ? `Claude Opus reviews your last ${INSIGHTS_WINDOW_DAYS} days of data and consults web sources for clinical context. Here's exactly what's included.`
                : `The AI analyses the last ${INSIGHTS_WINDOW_DAYS} days of your tracked data. Here's exactly what's included.`}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === "deep" && (
            <div className="wm-warn">
              <b>Deep analysis is a costly request</b>
              It runs a more powerful model with web search against current
              clinical references — typically 3-10 minutes and roughly
              10-20× the cost of a fast summary. You can close this and come
              back; the report will appear here when it&apos;s ready.
            </div>
          )}

          <div className="flex flex-col gap-3 text-sm">
            <div>
              <h3>Tracked data (last {INSIGHTS_WINDOW_DAYS} days)</h3>
              <ul className="wm-ul">
                {trackedData.map((item) => (
                  <li key={item} className="wm-li ok">
                    <Check aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="wm-note">
                Each is included only when the window holds enough data for it.
              </p>
            </div>

            <div>
              <h3>Your medical profile</h3>
              <ul className="wm-ul">
                <li className={shareConditions ? "wm-li ok" : "wm-li no"}>
                  {shareConditions ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                  <span>
                    {shareConditions ? (
                      <>
                        Conditions included:{" "}
                        <span className="text-foreground">
                          {profile.conditions.join(", ")}
                        </span>
                      </>
                    ) : (
                      "Conditions not included — turn on sharing in your Profile to personalise the summary"
                    )}
                  </span>
                </li>
                <li
                  className={
                    shareMedications && sharedMedicationCount !== 0 ? "wm-li ok" : "wm-li no"
                  }
                >
                  {shareMedications && sharedMedicationCount !== 0 ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <X aria-hidden="true" />
                  )}
                  <span>
                    {!shareMedications
                      ? "Medications not included — turn on sharing in your Profile to add prescription context"
                      : sharedMedicationCount === 0
                        ? "Medication sharing is on, but you have no active prescriptions to include"
                        : `Medications included — ${sharedMedicationCount ?? "your"} active prescription${sharedMedicationCount === 1 ? "" : "s"}, with doses and titration/maintenance phases`}
                  </span>
                </li>
              </ul>
            </div>

            {hasPrevious && (
              <div>
                <h3>Compare with history</h3>
                <label className="mt-1.5 flex min-h-11 gap-2 text-[0.8125rem] text-muted-foreground">
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

            <p className="wm-note mt-0">
              Only aggregated numbers are sent — individual entries, notes, and
              timestamps never leave your device.
              {includePrevious && hasPrevious
                ? " The text of your previous summary is sent too, so the AI can compare periods."
                : ""}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
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
          if (!open) openReport(null);
        }}
      >
        <DialogContent
          className="wm-dialog w-[calc(100%-24px)] border-line max-w-lg max-h-[85vh] flex flex-col"
          style={AI_C}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="wm-dh">
              <Sparkles className="text-ai" aria-hidden="true" />
              AI insights report
              {readingReport?.mode === "deep" && <DeepPill />}
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
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant={deleteArmed ? "destructive" : "outline"}
              onClick={deleteReadingReport}
              disabled={deleteReport.isPending}
            >
              <Trash2 />
              {deleteArmed ? "Tap again to delete" : "Delete report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
