"use client";

import { useMemo, useState } from "react";
import { Apple, Loader2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEatingRecordsByDateRange } from "@/hooks/use-eating-queries";

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

function StatusBadge({ status }: { status: NutrientFinding["status"] }) {
  const config = {
    high: {
      label: "High",
      classes:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    },
    low: {
      label: "Low",
      classes:
        "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
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

/**
 * On-demand AI scan of the user's eating log for nutrient biases (e.g.
 * "you've eaten a lot of potassium-rich foods like potatoes"). Sends only
 * food descriptions + portions — no timestamps, no PII. Results are
 * session-only and not persisted.
 */
export function NutrientAnalysisCard() {
  const [focus, setFocus] = useState("");
  const [focusOpen, setFocusOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<NutrientAnalysisResult | null>(null);
  const { toast } = useToast();

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

  const analyze = async () => {
    if (!canAnalyze) return;
    setPending(true);
    setResult(null);
    try {
      const trimmedFocus = focus.trim();
      const res = await fetch("/api/ai/nutrient-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windowDays: WINDOW_DAYS,
          foods,
          ...(trimmedFocus && { focus: trimmedFocus }),
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
      setResult(data);
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
        <p className="text-xs text-muted-foreground">
          Scan your last {WINDOW_DAYS} days of food entries for nutrient biases
          — e.g. too much potassium, low fiber. The model can web-search any
          branded or regional items it doesn&apos;t recognise, so this can take
          5-15 seconds. Only food descriptions are sent; timestamps stay on
          device.
        </p>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {foods.length} food {foods.length === 1 ? "entry" : "entries"} in
            the last {WINDOW_DAYS} days
          </span>
          <button
            type="button"
            onClick={() => setFocusOpen((v) => !v)}
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
            value={focus}
            onChange={(e) => setFocus(e.target.value.slice(0, 200))}
            placeholder="e.g. potassium, iron, fiber"
            className="h-8 text-xs"
            disabled={pending}
          />
        )}

        <Button
          size="sm"
          onClick={analyze}
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
          ) : result ? (
            "Re-analyze"
          ) : (
            "Analyze nutrient balance"
          )}
        </Button>

        {result && (
          <div className="space-y-2.5 pt-1">
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">
              {result.summary}
            </p>

            {result.findings.length > 0 && (
              <ul className="space-y-2">
                {result.findings.map((f, i) => (
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

            {result.caveats.length > 0 && (
              <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-2 space-y-1">
                <p className="flex items-center gap-1 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                  <AlertCircle className="w-3 h-3" />
                  Caveats
                </p>
                <ul className="space-y-0.5 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                  {result.caveats.map((c, i) => (
                    <li key={i}>• {c}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Observational only — not medical advice. Estimates are based on
              food descriptions, not measured nutrient amounts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
