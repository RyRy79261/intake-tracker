"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Apple,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useEatingRecordsByDateRange } from "@/hooks/use-eating-queries";
import { useUserProfile } from "@/hooks/use-profile-queries";
import { buildMedicationSummary } from "@/lib/analytics-snapshot";

const WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface NutrientFinding {
  nutrient: string;
  status: "high" | "low" | "balanced";
  detail: string;
  exampleFoods: string[];
}

interface NutrientAnalysisResult {
  summary: string;
  findings: NutrientFinding[];
  caveats: string[];
}

/** A scan result with the metadata needed for the in-session history list. */
interface ScanRecord extends NutrientAnalysisResult {
  id: string;
  generatedAt: number;
  focus?: string;
}

function StatusBadge({ status }: { status: NutrientFinding["status"] }) {
  const config = {
    high: {
      label: "High",
      classes:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    },
    low: {
      label: "Low",
      classes: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    },
    balanced: {
      label: "Balanced",
      classes:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

/** Compact one-row teaser. Tapping anywhere hands the full record to the
 *  parent so it can swap it into the reading dialog. Keeps the card from
 *  ballooning when a multi-finding scan would otherwise dominate the page. */
function ScanPreview({
  record,
  onOpen,
}: {
  record: ScanRecord;
  onOpen: (record: ScanRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="w-full text-left rounded-md border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors px-2.5 py-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[11px] text-muted-foreground truncate">
            {formatDistanceToNow(record.generatedAt, { addSuffix: true })}
          </span>
          {record.focus && (
            <span
              className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-[10px] font-medium truncate max-w-[10rem]"
              title={`Focus: ${record.focus}`}
            >
              {record.focus}
            </span>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          Read
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
        {record.summary}
      </p>
    </button>
  );
}

/** Full scan body — summary, findings list, caveats. Rendered inside the
 *  reading dialog; height-unconstrained so the dialog's own scroll
 *  container handles overflow. */
function ScanContent({ record }: { record: ScanRecord }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">
        {record.summary}
      </p>

      {record.findings.length > 0 && (
        <ul className="space-y-2">
          {record.findings.map((f, i) => (
            <li
              key={i}
              className="rounded-md border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 px-2.5 py-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {f.nutrient}
                </span>
                <StatusBadge status={f.status} />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {f.detail}
              </p>
              {f.exampleFoods.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  From: {f.exampleFoods.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {record.caveats.length > 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-2 space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-medium text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-3 h-3" />
            Caveats
          </p>
          <ul className="space-y-0.5 text-[11px] text-amber-900/90 dark:text-amber-200/90">
            {record.caveats.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Observational only — not medical advice. Estimates are based on food
        descriptions, not measured nutrient amounts.
      </p>
    </div>
  );
}

/**
 * On-demand AI scan of the user's eating log for nutrient biases (e.g.
 * "you've eaten a lot of potassium-rich foods like potatoes"). Sends only
 * food descriptions + portions — no timestamps, no PII. Results are
 * session-only — the in-session history shows in a collapsible and full
 * scans open in a reading dialog.
 */
export function NutrientAnalysisCard() {
  const [focus, setFocus] = useState("");
  const [focusOpen, setFocusOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [readingScan, setReadingScan] = useState<ScanRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { toast } = useToast();
  const profile = useUserProfile();

  const shareConditions =
    profile.shareConditionsWithAI && profile.conditions.length > 0;
  const shareMedications = profile.shareMedicationsWithAI;
  const personalised = shareConditions || shareMedications;

  // Pin the window at mount so the live query doesn't refetch every render.
  // Eating-record updates within the window still flow through Dexie's live
  // observation — only the window boundaries are stable.
  const window = useMemo(() => {
    const now = Date.now();
    return { start: now - WINDOW_DAYS * MS_PER_DAY, end: now };
  }, []);
  const records = useEatingRecordsByDateRange(window.start, window.end);

  const foods = useMemo(() => {
    return (records ?? [])
      .map((r) => {
        const description = r.originalInputText?.trim() || r.note?.trim();
        if (!description) return null;
        return r.grams !== undefined && r.grams > 0
          ? { description, grams: r.grams }
          : { description };
      })
      .filter((f): f is { description: string; grams?: number } => f !== null);
  }, [records]);

  const canAnalyze = foods.length > 0 && !pending;
  const latest = scans[0] ?? null;
  const history = scans.slice(1);

  const analyze = async () => {
    if (!canAnalyze) return;
    setConfirmOpen(false);
    setPending(true);
    try {
      const trimmedFocus = focus.trim();
      // Build the active-meds summary only when the user opted in; the
      // server schema makes it optional and ignores absence.
      const medications = shareMedications
        ? await buildMedicationSummary()
        : null;
      const res = await fetch("/api/ai/nutrient-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windowDays: WINDOW_DAYS,
          foods,
          ...(trimmedFocus && { focus: trimmedFocus }),
          ...(shareConditions && { conditions: profile.conditions }),
          ...(medications && medications.length > 0 && { medications }),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title:
            res.status === 429
              ? "Try again in a minute"
              : "Couldn't analyze your food log",
          description:
            typeof body?.error === "string"
              ? body.error
              : `Request failed with status ${res.status}.`,
          variant: "destructive",
        });
        return;
      }

      const data = (await res.json()) as NutrientAnalysisResult;
      const record: ScanRecord = {
        ...data,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        generatedAt: Date.now(),
        ...(trimmedFocus && { focus: trimmedFocus }),
      };
      setScans((prev) => [record, ...prev]);
      setReadingScan(record);
    } catch (e) {
      toast({
        title: "Couldn't analyze your food log",
        description: e instanceof Error ? e.message : "Network error.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Apple className="w-3.5 h-3.5 text-emerald-500" />
          Food nutrient check
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {latest ? (
          <ScanPreview record={latest} onOpen={setReadingScan} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Scan your last {WINDOW_DAYS} days of food entries for nutrient
            biases — e.g. too much potassium, low fiber. The model can
            web-search any branded or regional items it doesn&apos;t
            recognise, so this can take 5-15 seconds. Only food descriptions
            are sent; timestamps stay on device.
          </p>
        )}

        {personalised && (
          <p className="text-[11px] text-muted-foreground">
            Personalised with your medical profile
            {shareConditions && shareMedications
              ? " (conditions + medications)"
              : shareConditions
                ? " (conditions)"
                : " (medications)"}
            .
          </p>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {foods.length} food {foods.length === 1 ? "entry" : "entries"} in
            the last {WINDOW_DAYS} days
          </span>
          <button
            type="button"
            onClick={() => setFocusOpen((v) => !v)}
            aria-expanded={focusOpen}
            aria-controls="nutrient-focus-input"
            className="inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400 hover:underline"
          >
            {focusOpen ? (
              <>
                Hide focus
                <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Focus a nutrient
                <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        </div>

        {focusOpen && (
          <Input
            id="nutrient-focus-input"
            value={focus}
            onChange={(e) => setFocus(e.target.value.slice(0, 200))}
            placeholder="e.g. potassium, iron, fiber"
            className="h-8 text-xs"
            disabled={pending}
          />
        )}

        <Button
          variant={latest ? "outline" : "default"}
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={!canAnalyze}
          className="w-full"
        >
          {pending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing…
            </>
          ) : foods.length === 0 ? (
            "No food entries yet"
          ) : latest ? (
            "Run another scan"
          ) : (
            "Analyze nutrient balance"
          )}
        </Button>

        {history.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span>Previous scans ({history.length})</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    historyOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {history.map((record) => (
                <ScanPreview
                  key={record.id}
                  record={record}
                  onOpen={setReadingScan}
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
              <Apple className="w-4 h-4 text-emerald-500" />
              What goes into this scan
            </DialogTitle>
            <DialogDescription>
              The AI looks at the last {WINDOW_DAYS} days of food entries and
              the medical context you&apos;ve opted into sharing. Here&apos;s
              exactly what&apos;s included.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1.5">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Food data (last {WINDOW_DAYS} days)
              </p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                <li className="flex gap-1.5">
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  <span>
                    {foods.length} food{" "}
                    {foods.length === 1 ? "entry" : "entries"} — descriptions
                    and approximate portions in grams when logged
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                  <span>
                    Timestamps, notes, and any other tracked categories (water,
                    BP, weight, etc.) are NOT sent
                  </span>
                </li>
              </ul>
            </div>

            {focus.trim() !== "" && (
              <div className="space-y-1.5">
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  Focus
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Findings will lead with:{" "}
                  <span className="text-slate-700 dark:text-slate-200 font-medium">
                    {focus.trim()}
                  </span>
                </p>
              </div>
            )}

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
                      "Conditions not included — turn on sharing in your Profile to personalise the scan"
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
              Food descriptions are PII-stripped before they leave your device.
              The model may web-search any branded or regional items it
              doesn&apos;t recognise, so the scan typically takes 5-15 seconds.
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
            <Button size="sm" onClick={analyze} disabled={pending}>
              {latest ? "Run scan" : "Start analysis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={readingScan !== null}
        onOpenChange={(open) => {
          if (!open) setReadingScan(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Apple className="w-4 h-4 text-emerald-500" />
              Nutrient scan
              {readingScan?.focus && (
                <span
                  className="ml-1 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-[10px] font-medium"
                  title={`Focus: ${readingScan.focus}`}
                >
                  {readingScan.focus}
                </span>
              )}
            </DialogTitle>
            {readingScan && (
              <DialogDescription>
                Generated{" "}
                {formatDistanceToNow(readingScan.generatedAt, {
                  addSuffix: true,
                })}
                .
              </DialogDescription>
            )}
          </DialogHeader>
          {readingScan && (
            <div className="overflow-y-auto pr-1 -mr-1">
              <ScanContent record={readingScan} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
