"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Info } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { Button } from "@intake/ui/button";
import { Label } from "@intake/ui/label";
import { useAuthGate } from "@/components/auth-guard";
import { PillIcon } from "@/components/medications/pill-icon";
import { CollapseHead, fieldClass, WarnBox } from "@/components/medications/ward-bits";
import {
  MedicineSearchCancelledError,
  MedicineSearchError,
  searchMedicine,
} from "@/hooks/use-medicine-search";
import {
  appliedLabel,
  colorHex,
  defaultOption,
  FOOD_LABELS,
  GROUP_LABELS,
  groupValue,
  groupWhy,
  normalizeLookupResult,
  OPTION_GROUPS,
  optionText,
  shapeValue,
  type LookupGroup,
  type LookupOption,
  type LookupResult,
} from "@/components/medications/medicine-lookup";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

/**
 * Client-side stop for a lookup. The route stops itself at 80 s (a JSON 504)
 * inside a 90 s function limit; this catches a request that never answers.
 */
export const LOOKUP_TIMEOUT_MS = 95_000;

export const AI_NOTE = "AI information can be wrong. Check with your doctor or pharmacist.";

const MSG_EMPTY = "Type a medicine name or brand to look up.";
const MSG_OFFLINE =
  "You are offline. Connect to the internet and try again, or enter the details from the box.";
const MSG_TIMEOUT =
  "The lookup took too long and stopped. Try again, or enter the details from the box.";
const MSG_FAILED =
  "The AI service did not answer. Try again later, or enter the details from the box.";
/** Route error codes whose message tells the user what to do. */
const ACTIONABLE_CODES = new Set(["NO_AI_KEY", "KEY_UNREADABLE", "INVALID_KEY", "AI_REFUSED"]);

type LookupStatus = "idle" | "busy" | "done" | "error";

export interface LookupState {
  /** The text in the lookup field (the full panel only). */
  q: string;
  /** The query being (or last) looked up. */
  asked: string;
  status: LookupStatus;
  result: LookupResult | null;
  error: string | null;
  /** Index into `result.options`, or null when no strength is picked. */
  opt: number | null;
  /** Groups the user unticked (absent = ticked). */
  sel: Partial<Record<LookupGroup, boolean>>;
  /** Compact: show the full result details. */
  more: boolean;
  /** Contraindications and warnings expanded. */
  safe: boolean;
  /** After Apply: the result is collapsed to a summary until reopened. */
  open: boolean;
  /** What the last Apply filled in. */
  applied: string[] | null;
}

const fresh = (): LookupState => ({
  q: "",
  asked: "",
  status: "idle",
  result: null,
  error: null,
  opt: null,
  sel: {},
  more: false,
  safe: false,
  open: true,
  applied: null,
});

function describeError(err: unknown): string {
  if (err instanceof MedicineSearchError) {
    if (err.status === 504) return MSG_TIMEOUT;
    if (err.status === 429) return "Too many lookups. Wait a minute and try again, or enter the details from the box.";
    if (err.code && ACTIONABLE_CODES.has(err.code)) return err.message;
    return MSG_FAILED;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return MSG_OFFLINE;
  return MSG_FAILED;
}

export interface MedicineLookup {
  state: LookupState;
  /** Start a lookup. Aborts one already running. */
  go: (query: string) => void;
  /** Abort the running lookup; keeps an earlier result. */
  cancel: () => void;
  /** Back to an empty lookup (aborts one running). */
  clear: () => void;
  set: (partial: Partial<LookupState>) => void;
}

/**
 * State for one lookup host (the wizard shares one across its steps). Cancel
 * and unmount abort the request through an AbortController.
 */
export function useMedicineLookup({ timeoutMs = LOOKUP_TIMEOUT_MS }: { timeoutMs?: number } = {}): MedicineLookup {
  const [state, setState] = useState<LookupState>(fresh);
  const ctrl = useRef<AbortController | null>(null);
  const token = useRef(0);

  const abort = useCallback(() => {
    token.current += 1;
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);

  useEffect(() => abort, [abort]);

  const set = useCallback((partial: Partial<LookupState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const go = useCallback(
    (query: string) => {
      const q = query.trim();
      abort();
      if (!q) {
        setState((s) => ({ ...s, status: "error", error: MSG_EMPTY }));
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState((s) => ({ ...s, asked: q, status: "error", error: MSG_OFFLINE, result: null, applied: null }));
        return;
      }
      const controller = new AbortController();
      ctrl.current = controller;
      const tok = token.current;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      setState((s) => ({
        ...s,
        asked: q,
        status: "busy",
        error: null,
        result: null,
        applied: null,
        open: true,
      }));
      searchMedicine({ query: q, signal: controller.signal })
        .then((raw) => {
          if (tok !== token.current) return;
          const result = normalizeLookupResult(raw, q);
          setState((s) => ({
            ...s,
            status: "done",
            result,
            opt: result.none ? null : defaultOption(result, q),
            sel: {},
            more: false,
            safe: false,
          }));
        })
        .catch((err: unknown) => {
          if (timedOut && tok === token.current) {
            setState((s) => ({ ...s, status: "error", error: MSG_TIMEOUT }));
            return;
          }
          if (tok !== token.current || err instanceof MedicineSearchCancelledError) return;
          setState((s) => ({ ...s, status: "error", error: describeError(err) }));
        })
        .finally(() => {
          clearTimeout(timer);
          if (ctrl.current === controller) ctrl.current = null;
        });
    },
    [abort, timeoutMs],
  );

  const cancel = useCallback(() => {
    abort();
    setState((s) => ({ ...s, status: s.result ? "done" : "idle" }));
  }, [abort]);

  const clear = useCallback(() => {
    abort();
    setState(fresh());
  }, [abort]);

  return { state, go, cancel, clear, set };
}

// ─── Presentation ─────────────────────────────────────────────────────────

export function AiIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8Z" />
      <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
    </svg>
  );
}

/** `.ailk` / `.ailr`: AI-violet stripe box. It opens an `ai` domain scope, so
 * its buttons, selected option and focus rings stay violet inside the teal
 * Medications window. */
const BOX =
  "flex min-w-0 flex-col gap-2 border border-ai/50 py-2.5 pl-[13px] pr-2.5 shadow-[inset_3px_0_0_hsl(var(--ai))]";
const HELP = "text-[0.8125rem] leading-[1.4] text-muted-foreground";
const AI_BTN = "w-full border-ai text-ai hover:bg-ai/10 hover:text-ai";

export interface ApplyContext {
  /** Ticked groups that have a value. */
  groups: LookupGroup[];
  result: LookupResult;
  option: LookupOption | null;
}

export interface MedicineLookupPanelProps {
  lookup: MedicineLookup;
  /** The groups this host can fill in, in display order. */
  groups: LookupGroup[];
  /** Compact: no query field; looks up the name already in the form. */
  compact?: boolean;
  /** Query used when the lookup field is empty (the host form's name). */
  fallbackQuery?: string;
  placeholder?: string;
  /** Groups shown but not fillable here, with the reason. */
  unavailable?: Partial<Record<LookupGroup, string>>;
  /** Signed out: offer a Sign in link as well as the notice. */
  showSignIn?: boolean;
  /** Write the ticked groups into the host form. */
  onApply: (ctx: ApplyContext) => void;
  className?: string;
}

/**
 * The AI medicine lookup (prototype `lookHtml` / `lookResHtml`): a query
 * field, busy / cancel / error / offline / no-match states, then the result
 * with a strength picker and one checkbox per group this host can fill in.
 * Sign-in gated: signed out it is a one-line notice.
 */
export function MedicineLookupPanel({
  lookup,
  groups,
  compact = false,
  fallbackQuery = "",
  placeholder = "e.g. Entresto or Bisoprolol",
  unavailable = {},
  showSignIn = false,
  onApply,
  className,
}: MedicineLookupPanelProps) {
  const signedIn = useAuthGate();
  const region = useSettingsStore((s) => s.primaryRegion);
  const fieldId = useId();
  const { state: L, go, cancel, set } = lookup;
  const regionText = region && region !== "none" ? region : "not set";

  if (!signedIn) {
    return (
      <div
        data-testid="medicine-lookup"
        className={cn(
          "flex min-h-11 items-center gap-2 border border-line bg-background py-1 pl-3 pr-1.5 text-[0.8125rem] text-muted-foreground shadow-[inset_3px_0_0_hsl(var(--muted-foreground))]",
          className,
        )}
      >
        <AiIcon />
        <span className="min-w-0 flex-1">Sign in to use AI lookup</span>
        {showSignIn && (
          <Button asChild variant="outline" size="sm" className="h-10 flex-none">
            <a href="/auth">Sign in</a>
          </Button>
        )}
      </div>
    );
  }

  const query = (L.q.trim() || fallbackQuery.trim());
  const start = () => go(query);

  if (L.status === "busy") {
    return (
      <div data-testid="medicine-lookup" data-domain="ai" className={cn(BOX, "bg-ai/6", className)} role="status" aria-live="polite">
        <div className="flex items-start gap-2.5 text-[0.8125rem]">
          <Spinner className="size-4 mt-0.5 shrink-0 text-ai" />
          <div className="min-w-0 flex-1">
            <b className="block font-semibold [overflow-wrap:anywhere]">Looking up “{L.asked}”</b>
            <p className="mt-0.5 leading-[1.4] text-muted-foreground">
              Searching brands sold in {regionText}. This can take up to a minute.
            </p>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={cancel}>
          Cancel
        </Button>
      </div>
    );
  }

  if (L.status === "done" && L.result) {
    return (
      <LookupResultView
        lookup={lookup}
        groups={groups}
        compact={compact}
        unavailable={unavailable}
        onApply={onApply}
        onRetry={start}
        className={className}
      />
    );
  }

  const err = L.status === "error" && L.error ? (
    <p role="alert" className="text-[0.8125rem] text-bp">{L.error}</p>
  ) : null;
  const label = L.status === "error" ? "Try again" : "Look up with AI";

  if (compact) {
    return (
      <div data-testid="medicine-lookup" data-domain="ai" className={cn(BOX, "bg-ai/6", className)}>
        <div className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ai">
          <AiIcon />
          Look up with AI
        </div>
        {err}
        <p className={HELP}>
          {query ? (
            <>
              Uses the name you entered: <b className="text-foreground">{query}</b>.
            </>
          ) : (
            "Enter the medicine name on step 1 first."
          )}{" "}
          Region: {regionText}.
        </p>
        <Button variant="outline" className={AI_BTN} onClick={start} disabled={!query}>
          <AiIcon />
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="medicine-lookup" data-domain="ai" className={cn(BOX, "bg-ai/6", className)}>
      <div className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ai">
        <AiIcon />
        Look up with AI
      </div>
      <div>
        <Label htmlFor={fieldId} className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">
          Medicine name or brand
        </Label>
        <input
          id={fieldId}
          className={fieldClass}
          value={L.q}
          placeholder={placeholder}
          autoComplete="off"
          type="text"
          enterKeyHint="search"
          onChange={(e) => set({ q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLElement).blur();
              start();
            }
          }}
        />
      </div>
      {err}
      <Button variant="outline" className={AI_BTN} onClick={start}>
        <AiIcon />
        {label}
      </Button>
      <p className={HELP}>
        Region: {regionText} (change it in Settings). AI fills in the strength, compounds, appearance and
        more. You check each field.
      </p>
    </div>
  );
}

function LookupResultView({
  lookup,
  groups,
  compact,
  unavailable,
  onApply,
  onRetry,
  className,
}: {
  lookup: MedicineLookup;
  groups: LookupGroup[];
  compact: boolean;
  unavailable: Partial<Record<LookupGroup, string>>;
  onApply: (ctx: ApplyContext) => void;
  onRetry: () => void;
  className: string | undefined;
}) {
  const { state: L, clear, set } = lookup;
  const r = L.result!;
  const box = cn(BOX, "bg-background gap-2.5 pb-3", className);

  const head = (title: string, sub: string) => (
    <div className="flex items-start gap-2 text-ai">
      <AiIcon className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <b className="text-[0.9375rem] font-semibold text-foreground [overflow-wrap:anywhere]">{title}</b>
        {sub && <span className="text-[0.8125rem] leading-[1.4] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );

  if (r.none) {
    return (
      <div data-testid="medicine-lookup" className={box}>
        {head("No match found", `for “${r.query}”`)}
        <p className={HELP}>
          Check the spelling, or try the generic name (the name of the active ingredient). You can also enter
          the details from the box.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={clear}>Search again</Button>
          <Button variant="outline" onClick={onRetry}>Try again</Button>
        </div>
      </div>
    );
  }

  if (L.applied && !L.open) {
    const done = L.applied.join(", ");
    return (
      <div data-testid="medicine-lookup" className={box}>
        {head(
          "Filled in from AI lookup",
          `${done.charAt(0).toUpperCase()}${done.slice(1)}. Check each field against your box.`,
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => set({ open: true })}>Show result</Button>
          <Button variant="outline" onClick={clear}>Look up again</Button>
        </div>
      </div>
    );
  }

  const option = L.opt != null ? r.options[L.opt] ?? null : null;
  const fillable = (g: LookupGroup) => !unavailable[g];
  const needOpt =
    r.options.length > 1 && groups.some((g) => (OPTION_GROUPS.has(g) || g === "appearance") && fillable(g));
  const showKv = !compact || L.more;
  const rows = groups.map((g) => {
    const v = fillable(g) ? groupValue(g, r, option) : "";
    // A single drug has no compounds to fill in anywhere: say that, not where
    // compounds are edited.
    const elsewhere = g === "compounds" && r.activeIngredients.length < 2 ? undefined : unavailable[g];
    // A lone group has no checkbox to tick again, so a group unticked on an
    // earlier wizard step (the lookup is shared) must not switch it off here.
    const ticked = groups.length === 1 || L.sel[g] !== false;
    return { g, v, why: elsewhere ?? groupWhy(g, r), on: !!v && ticked };
  });
  const any = rows.some((x) => x.on);
  const food =
    r.foodInstruction === "none"
      ? r.foodNote || FOOD_LABELS.none
      : FOOD_LABELS[r.foodInstruction] + (r.foodNote ? `. ${r.foodNote}` : "");
  const shape = shapeValue(r);
  const hex = colorHex(r);

  const apply = () => {
    const picked = rows.filter((x) => x.on).map((x) => x.g);
    if (!picked.length) return;
    onApply({ groups: picked, result: r, option });
    set({ applied: picked.map((g) => appliedLabel(g, r)), open: false });
  };

  return (
    <div data-testid="medicine-lookup" className={box} role="region" aria-label="AI lookup result">
      {head(`Found: ${r.genericName || r.brand}`, r.brandNames.join(", "))}
      {r.isGenericFallback && (
        <WarnBox title="Brand not found">
          No details were found for “{r.query}”. The details below are for the generic equivalent. Check the
          appearance against your box.
        </WarnBox>
      )}
      {showKv && (
        <>
          <dl className="m-0 grid grid-cols-[minmax(0,6.6em)_minmax(0,1fr)] gap-x-2.5 gap-y-[7px] text-[0.8125rem] leading-[1.4] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-muted-foreground">
            {r.brandNames.length > 0 && (
              <>
                <dt>Brands</dt>
                <dd>{r.brandNames.join(", ")}</dd>
              </>
            )}
            {r.localAlternatives.length > 0 && (
              <>
                <dt>Local</dt>
                <dd>{r.localAlternatives.join(", ")}</dd>
              </>
            )}
            {r.activeIngredients.length > 0 && (
              <>
                <dt>Active ingredients</dt>
                <dd>
                  {r.activeIngredients.join(" + ")}
                  {r.activeIngredients.length > 1 && <span className="text-muted-foreground"> (combination)</span>}
                </dd>
              </>
            )}
            {r.dosageStrengths.length > 0 && (
              <>
                <dt>Strengths</dt>
                <dd className="font-mono">{r.dosageStrengths.join(", ")}</dd>
              </>
            )}
            {r.drugClass && (
              <>
                <dt>Type</dt>
                <dd>{r.drugClass}</dd>
              </>
            )}
            {r.commonIndications.length > 0 && (
              <>
                <dt>Used for</dt>
                <dd>
                  {r.commonIndications.map((x, i) => (
                    <span key={i} className="block">{x}</span>
                  ))}
                </dd>
              </>
            )}
            <dt>Food</dt>
            <dd>{food}</dd>
            {(r.pillShape || r.pillColor || r.pillDescription) && (
              <>
                <dt>Looks like</dt>
                <dd>
                  <span className="flex items-start gap-2">
                    {shape && <PillIcon shape={shape} color={hex ?? "#9E9E9E"} size={28} />}
                    <span>
                      {(r.pillColor || r.pillShape) && (
                        <b className="block font-semibold">
                          {`${r.pillColor.charAt(0).toUpperCase()}${r.pillColor.slice(1)} ${r.pillShape}`.trim()}
                        </b>
                      )}
                      {r.pillDescription}
                    </span>
                  </span>
                </dd>
              </>
            )}
            {r.visualIdentification && (
              <>
                <dt>Markings</dt>
                <dd>{r.visualIdentification}</dd>
              </>
            )}
          </dl>
          {(r.contraindications.length > 0 || r.warnings.length > 0) && (
            <>
              <CollapseHead sub open={L.safe} onToggle={() => set({ safe: !L.safe })}>
                When not to take it ({r.contraindications.length}) · Warnings ({r.warnings.length})
              </CollapseHead>
              {L.safe && (
                <div className="flex flex-col text-[0.8125rem]">
                  <p className="mb-1 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground">WHEN NOT TO TAKE IT</p>
                  <ul className="ml-4 list-disc space-y-0.5">
                    {r.contraindications.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                  <p className="mb-1 mt-2 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground">WARNINGS</p>
                  <ul className="ml-4 list-disc space-y-0.5">
                    {r.warnings.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
      {compact && (
        <CollapseHead sub open={L.more} onToggle={() => set({ more: !L.more })}>
          {L.more ? "Hide details" : "Show all details"}
        </CollapseHead>
      )}
      {needOpt && (
        <div>
          <span className="mb-1 block text-[0.8125rem] text-muted-foreground">Pick your strength</span>
          <div className="flex flex-col border border-line" role="radiogroup" aria-label="Strength">
            {r.options.map((x, i) => (
              <button
                key={`${x.label}-${i}`}
                type="button"
                role="radio"
                aria-checked={L.opt === i}
                onClick={() => set({ opt: i })}
                className={cn(
                  "flex min-h-12 flex-col items-start justify-center gap-px border-t border-line px-2.5 py-1 text-left first:border-t-0",
                  L.opt === i ? "bg-primary text-primary-foreground" : "bg-panel hover:bg-foreground/6",
                )}
              >
                <b className="font-mono text-sm font-semibold">{x.label}</b>
                <span className={cn("text-xs", L.opt === i ? "text-primary-foreground" : "text-muted-foreground")}>
                  {optionText(x)} per pill
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.length > 1 ? (
        <div className="flex flex-col">
          <span className="mb-1 block text-[0.8125rem] text-muted-foreground">Fill in</span>
          {rows.map((x) => (
            <button
              key={x.g}
              type="button"
              role="checkbox"
              aria-checked={x.on}
              aria-disabled={x.v ? undefined : true}
              onClick={() => {
                if (!x.v) return;
                set({ sel: { ...L.sel, [x.g]: L.sel[x.g] === false } });
              }}
              className={cn(
                "flex min-h-11 w-full items-start gap-2.5 py-[5px] text-left text-[0.8125rem] leading-[1.35]",
                !x.v && "cursor-default opacity-55",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 flex-none items-center justify-center border border-muted-foreground",
                  x.on && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {x.on && <Check className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{GROUP_LABELS[x.g]}</b>
                <small className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{x.v || x.why}</small>
              </span>
            </button>
          ))}
        </div>
      ) : rows[0] ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <b>{GROUP_LABELS[rows[0].g]}:</b>
          {rows[0].v ? (
            <>
              {rows[0].g === "appearance" && shape && <PillIcon shape={shape} color={hex ?? "#9E9E9E"} size={22} />}
              <span>{rows[0].v}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{rows[0].why}</span>
          )}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={clear}>{compact ? "Look up again" : "Clear"}</Button>
        <Button onClick={apply} disabled={!any}>{rows.length > 1 ? "Apply to form" : "Use this"}</Button>
      </div>
      <p className="flex items-start gap-1.5 text-xs leading-[1.4] text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{AI_NOTE}</span>
      </p>
    </div>
  );
}

