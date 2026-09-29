"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Apple,
  Loader2,
  ChevronDown,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
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
import { useEatingRecordsByDateRange } from "@/hooks/use-eating-queries";
import { useUserProfile } from "@/hooks/use-profile-queries";
import { useSharedMedicationCount } from "@/hooks/use-insights";
import { buildMedicationSummary } from "@/lib/analytics-snapshot";
import { apiFetch } from "@/lib/api-fetch";
import {
  MAX_FOOD_DESCRIPTION_CHARS,
  MAX_FOOD_GRAMS,
  MAX_FOOD_ENTRIES,
} from "@intake/ai-prompts/nutrient-analysis";

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

const C_WEIGHT = { "--c": "hsl(var(--weight))" } as CSSProperties;
const C_AI = { "--c": "hsl(var(--ai))" } as CSSProperties;

function StatusBadge({ status }: { status: NutrientFinding["status"] }) {
  const config = {
    high: { label: "High", color: "hsl(var(--sodium))" },
    low: { label: "Low", color: "hsl(var(--water))" },
    balanced: { label: "Balanced", color: "hsl(var(--weight))" },
  }[status];
  return (
    <span className="wm-pill" style={{ "--c": config.color } as CSSProperties}>
      {config.label}
    </span>
  );
}

/** Outlined focus-nutrient marker. */
function FocusPill({ focus }: { focus: string }) {
  return (
    <span className="wm-pill max-w-40 truncate" style={C_AI} title={`Focus: ${focus}`}>
      {focus}
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
    <button type="button" onClick={() => onOpen(record)} className="wm-prev" style={C_WEIGHT}>
      <span className="wm-pt">
        <span className="truncate">
          {formatDistanceToNow(record.generatedAt, { addSuffix: true })}
        </span>
        {record.focus && <FocusPill focus={record.focus} />}
        <span className="rd">Read ›</span>
      </span>
      <span className="wm-clamp">{record.summary}</span>
    </button>
  );
}

/** Full scan body — summary, findings list, caveats. Rendered inside the
 *  reading dialog; height-unconstrained so the dialog's own scroll
 *  container handles overflow. */
function ScanContent({ record }: { record: ScanRecord }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground whitespace-pre-line">
        {record.summary}
      </p>

      {record.findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {record.findings.map((f, i) => (
            <li key={i} className="wm-find">
              <div className="h">
                <span>{f.nutrient}</span>
                <StatusBadge status={f.status} />
              </div>
              <p>{f.detail}</p>
              {f.exampleFoods.length > 0 && (
                <p>From: {f.exampleFoods.join(", ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {record.caveats.length > 0 && (
        <div className="wm-warn">
          <b className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Caveats
          </b>
          <ul>
            {record.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="wm-note mt-0">
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
  // Sharing can be on with no active prescription to send; label what is
  // actually sent, not the toggle.
  const sharedMedicationCount = useSharedMedicationCount(shareMedications);
  const sendsMedications = (sharedMedicationCount ?? 0) > 0;
  const personalised = shareConditions || sendsMedications;

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
        // Clamp to the server's per-entry caps: descriptions come from raw
        // user input (voice-dictated meals run long) and one oversize entry
        // would 400 the whole scan.
        const description = (r.originalInputText?.trim() || r.note?.trim())
          ?.slice(0, MAX_FOOD_DESCRIPTION_CHARS);
        if (!description) return null;
        return r.grams !== undefined && r.grams > 0
          ? { description, grams: Math.min(r.grams, MAX_FOOD_GRAMS) }
          : { description };
      })
      .filter((f): f is { description: string; grams?: number } => f !== null)
      // Records arrive timestamp-ascending; keep the most recent entries
      // when a heavy logger exceeds the server's array cap.
      .slice(-MAX_FOOD_ENTRIES);
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
      // apiFetch, not fetch: the Android static export has no local api/
      // routes and needs the base URL + Bearer token apiFetch adds.
      const res = await apiFetch("/api/ai/nutrient-analysis", {
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
    <section className="wm-card" style={C_WEIGHT} aria-label="Food nutrient check">
      <h3 className="wm-ct">
        <Apple className="text-weight" aria-hidden="true" />
        Food nutrient check
      </h3>
      {latest ? (
        <ScanPreview record={latest} onOpen={setReadingScan} />
      ) : (
        <p className="wm-p">
          Scan your last {WINDOW_DAYS} days of food entries for nutrient
          biases — e.g. too much potassium, low fiber. The model can
          web-search any branded or regional items it doesn&apos;t
          recognise, so this can take 5-15 seconds. Only food descriptions
          are sent; timestamps stay on device.
        </p>
      )}

      {personalised && (
        <p className="wm-note">
          Personalised with your medical profile
          {shareConditions && sendsMedications
            ? " (conditions + medications)"
            : shareConditions
              ? " (conditions)"
              : " (medications)"}
          .
        </p>
      )}

      <div className="wm-row">
        <span>
          {foods.length} food {foods.length === 1 ? "entry" : "entries"} in
          the last {WINDOW_DAYS} days
        </span>
        <button
          type="button"
          onClick={() => setFocusOpen((v) => !v)}
          aria-expanded={focusOpen}
          aria-controls="nutrient-focus-input"
          className="wm-link"
        >
          {focusOpen ? "Hide focus" : "Focus a nutrient"}
          <span aria-hidden="true">{focusOpen ? " ▴" : " ▾"}</span>
        </button>
      </div>

      {focusOpen && (
        <Input
          id="nutrient-focus-input"
          aria-label="Nutrient to focus on"
          value={focus}
          onChange={(e) => setFocus(e.target.value.slice(0, 200))}
          placeholder="e.g. potassium, iron, fiber"
          className="mt-1.5"
          disabled={pending}
        />
      )}

      <Button
        variant={latest ? "outline" : "default"}
        onClick={() => setConfirmOpen(true)}
        disabled={!canAnalyze}
        className="wm-full"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
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
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="wm-hist">
          <CollapsibleTrigger asChild>
            <button type="button">
              Previous scans ({history.length})
              <ChevronDown aria-hidden="true" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="wm-dialog wm-dlg w-[calc(100%-24px)] border-line max-w-sm" style={C_WEIGHT}>
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="wm-dh">
              <Apple className="text-weight" aria-hidden="true" />
              What goes into this scan
            </DialogTitle>
            <DialogDescription>
              The AI looks at the last {WINDOW_DAYS} days of food entries and
              the medical context you&apos;ve opted into sharing. Here&apos;s
              exactly what&apos;s included.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 text-sm">
            <div>
              <h3>Food data (last {WINDOW_DAYS} days)</h3>
              <ul className="wm-ul">
                <li className="wm-li ok">
                  <Check aria-hidden="true" />
                  <span>
                    {foods.length} food{" "}
                    {foods.length === 1 ? "entry" : "entries"} — descriptions
                    and approximate portions in grams when logged
                  </span>
                </li>
                <li className="wm-li no">
                  <X aria-hidden="true" />
                  <span>
                    Timestamps, notes, and any other tracked categories (water,
                    BP, weight, etc.) are NOT sent
                  </span>
                </li>
              </ul>
            </div>

            {focus.trim() !== "" && (
              <div>
                <h3>Focus</h3>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                  Findings will lead with:{" "}
                  <span className="text-foreground font-medium">
                    {focus.trim()}
                  </span>
                </p>
              </div>
            )}

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
                      "Conditions not included — turn on sharing in your Profile to personalise the scan"
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
                        : "Medications included — your active prescriptions, doses, and titration/maintenance phases"}
                  </span>
                </li>
              </ul>
            </div>

            <p className="wm-note mt-0">
              Food descriptions are sent to our server, where common PII
              patterns (emails, phone numbers, ID-like number sequences) are
              redacted before the descriptions reach the AI model. The model
              may web-search any branded or regional items it doesn&apos;t
              recognise, so the scan typically takes 5-15 seconds.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={analyze} disabled={pending || !canAnalyze}>
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
        <DialogContent
          className="wm-dialog w-[calc(100%-24px)] border-line max-w-lg max-h-[85vh] flex flex-col"
          style={C_WEIGHT}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="wm-dh">
              <Apple className="text-weight" aria-hidden="true" />
              Nutrient scan
              {readingScan?.focus && <FocusPill focus={readingScan.focus} />}
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
    </section>
  );
}
