"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import type { Prescription } from "@intake/types/records";
import { ShellIcon } from "@/components/shell/shell-icon";
import { aiClient, type InteractionResult } from "@/lib/ai-client";
import { getCachedEntry, interactionCacheKey, setCache } from "@/lib/interaction-cache";
import {
  reportHeadline,
  savedCautions,
  verdictOf,
  type SavedCaution,
  type Verdict,
} from "@/lib/interaction-report";
import { useWindowStore } from "@/stores/window-store";
import { cn } from "@/lib/utils";

/** One substance in the report. */
interface Row {
  key: number;
  heard: string;
  name: string;
  brand?: string | undefined;
  unsure: boolean;
  result?: InteractionResult;
  error?: string;
}

type Phase =
  | { kind: "reading" }
  | { kind: "checking" }
  | { kind: "list" }
  | { kind: "no-meds" }
  | { kind: "failed"; message: string };

const VERDICT_WORD: Record<Verdict, string> = { avoid: "Do not take", caution: "Careful", ok: "OK" };
const VERDICT_BG: Record<Verdict, string> = { avoid: "bg-bp", caution: "bg-sodium", ok: "bg-weight" };
const VERDICT_BORDER: Record<Verdict, string> = { avoid: "border-bp", caution: "border-sodium", ok: "border-weight" };
const SEVERITY_BG = { AVOID: "bg-bp", CAUTION: "bg-sodium", OK: "bg-weight" } as const;

const MSG_TIMEOUT = "The check took too long and stopped. Try again.";

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ai/25 border-t-ai",
        className,
      )}
      aria-hidden="true"
    />
  );
}

interface InteractionReportProps {
  /** What the user said. */
  transcript: string;
  /** The user's prescriptions (only the active ones are used). */
  prescriptions: Prescription[];
  /** Close the screen. */
  onDone: () => void;
  /** Go back to the recorder for another question. */
  onAskAgain: () => void;
}

/**
 * The answer to a spoken "look up the interactions of …". Nothing is logged:
 * the screen finds the substances named (correcting misheard drug names),
 * checks each one against the user's active medicines, and fills in a short,
 * blunt verdict per substance as each check comes back. A question with no
 * substance ("what can't I take?") shows the notes already saved on the
 * prescriptions instead, with no AI wait.
 */
export function InteractionReport({ transcript, prescriptions: allPrescriptions, onDone, onAskAgain }: InteractionReportProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [rows, setRows] = useState<Row[]>([]);
  // Fixed for the life of the report: the question was asked against these.
  const [prescriptions] = useState(() => allPrescriptions.filter((p) => p.isActive && !p.deletedAt));
  const [overCap, setOverCap] = useState(0);
  const openWindow = useWindowStore((s) => s.open);
  const abortRef = useRef<AbortController | null>(null);
  const nextKey = useRef(0);

  const medNames = useMemo(() => [...new Set(prescriptions.map((p) => p.genericName))], [prescriptions]);

  const patchRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Check one substance against the medicines; the answer fills its row. */
  const checkRow = useCallback(async (row: Row, meds: string[], signal: AbortSignal) => {
    const cacheKey = interactionCacheKey(row.name, meds);
    const cached = getCachedEntry<InteractionResult>(cacheKey);
    if (cached) {
      patchRow(row.key, { result: cached.data });
      return;
    }
    const res = await aiClient.call(
      "/api/ai/interaction-check",
      { mode: "lookup", substance: row.name, activePrescriptions: meds.map((genericName) => ({ genericName })) },
      { signal },
    );
    if (signal.aborted) return;
    if (!res.ok) {
      if (res.error.code === "CANCELLED") return;
      patchRow(row.key, { error: res.error.code === "AI_TIMEOUT" ? MSG_TIMEOUT : res.error.message });
      return;
    }
    setCache(cacheKey, res.data);
    patchRow(row.key, { result: res.data });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    void (async () => {
      const meds = [...new Set(prescriptions.map((p) => p.genericName))];
      const read = await aiClient.call(
        "/api/ai/voice-interactions",
        { transcript, medications: meds },
        { signal },
      );
      if (signal.aborted) return;
      if (!read.ok) {
        if (read.error.code !== "CANCELLED") setPhase({ kind: "failed", message: read.error.message });
        return;
      }
      const { substances, overCap: cut } = read.data;
      setOverCap(cut ?? 0);
      if (substances.length === 0) {
        setPhase({ kind: "list" });
        return;
      }
      if (meds.length === 0) {
        setPhase({ kind: "no-meds" });
        return;
      }
      const start: Row[] = substances.map((s) => ({
        key: nextKey.current++,
        heard: s.heard,
        name: s.name,
        brand: s.brand,
        unsure: s.unsure,
      }));
      setRows(start);
      setPhase({ kind: "checking" });
      // All at once: each row fills in when its own answer arrives.
      await Promise.all(start.map((r) => checkRow(r, meds, signal)));
    })();
    return () => controller.abort();
  }, [transcript, prescriptions, checkRow]);

  /** The user typed the right name: check that instead. */
  const fixRow = (key: number, name: string) => {
    const signal = abortRef.current?.signal;
    if (!signal) return;
    const fixed: Row = { key, heard: name, name, unsure: false };
    setRows((rs) => rs.map((r) => (r.key === key ? fixed : r)));
    void checkRow(fixed, medNames, signal);
  };

  const done = rows.filter((r) => r.result || r.error).length;
  const working = phase.kind === "reading" || (phase.kind === "checking" && done < rows.length);
  const verdicts = rows.flatMap((r) => (r.result ? [{ name: r.name, verdict: verdictOf(r.result).verdict }] : []));
  const unchecked = rows.filter((r) => !r.result).length;
  const allIn = phase.kind === "checking" && rows.length > 0 && done === rows.length;
  const worst = verdicts.some((v) => v.verdict === "avoid")
    ? "avoid"
    : verdicts.some((v) => v.verdict === "caution") || unchecked > 0
      ? "caution"
      : "ok";

  const title = phase.kind === "list" ? "What you can't take" : "Interaction check";
  const status =
    phase.kind === "reading"
      ? "Finding the medicines you named…"
      : phase.kind === "checking"
        ? working
          ? `Checking ${rows.length} against your ${medNames.length} medicines · ${done} of ${rows.length} done · this can take a minute`
          : `${rows.length} checked · nothing logged`
        : phase.kind === "list"
          ? "From the notes saved on your medicines"
          : "Nothing logged";

  return (
    <div className="flex h-full flex-col" data-testid="interaction-report">
      {/* Right padding keeps the spinner clear of the sheet's close button. */}
      <div className="flex shrink-0 items-center gap-2 border-b pb-3 pr-10">
        <ShellIcon name="pill" size={20} className="text-meds" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>
        {working && <Spinner className="h-5 w-5" />}
      </div>

      <div className="-mx-6 flex-1 overflow-y-auto px-6 pt-3 pb-4">
        <p className="mb-3 text-xs text-muted-foreground">
          You asked: <q className="italic text-foreground">{transcript}</q>
        </p>

        {allIn && (
          <p
            role="status"
            className={cn("mb-3 px-3 py-2 text-base font-semibold text-on-domain", VERDICT_BG[worst])}
            data-testid="interaction-headline"
          >
            {reportHeadline(verdicts, unchecked)}
          </p>
        )}

        {phase.kind === "reading" && (
          <div className="flex items-center gap-2.5 border border-dashed border-line p-3 text-[0.8125rem] text-muted-foreground">
            <Spinner />
            <span>Reading your question. Then each medicine is checked on its own.</span>
          </div>
        )}

        {phase.kind === "failed" && (
          <p role="alert" className="border border-bp p-3 text-sm">
            {phase.message}
          </p>
        )}

        {phase.kind === "no-meds" && (
          <p className="border border-line p-3 text-sm">
            You have no active medicines. Add them in Medications first, then ask again.
          </p>
        )}

        {phase.kind === "checking" &&
          rows.map((r) => <VerdictBlock key={r.key} row={r} onFix={(name) => fixRow(r.key, name)} />)}

        {phase.kind === "list" && (
          <SavedList list={savedCautions(prescriptions)} medCount={medNames.length} />
        )}

        {overCap > 0 && (
          <p className="mt-2 text-xs text-sodium">
            {overCap} more {overCap === 1 ? "name was" : "names were"} left out. Ask about them separately.
          </p>
        )}

        {phase.kind === "checking" && (
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Checked against {medNames.join(", ")}. This is an AI answer, not a doctor. If you are not sure, ask your
            pharmacist first.
          </p>
        )}
      </div>

      <div
        className="-mx-6 -mb-6 flex shrink-0 gap-2 border-t bg-background/95 px-3 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            openWindow("meds");
            onDone();
          }}
        >
          Open Medications
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onAskAgain}>
          Ask another
        </Button>
        <Button className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** One substance: banner, one blunt line, the clashes, and the detail. */
function VerdictBlock({ row, onFix }: { row: Row; onFix: (name: string) => void }) {
  if (!row.result && !row.error) {
    return (
      <div className="mb-2.5 flex items-center gap-2.5 border border-dashed border-line p-3 text-[0.8125rem] text-muted-foreground">
        <Spinner />
        <span>
          Checking <b className="text-foreground">{row.name}</b>…
        </span>
      </div>
    );
  }
  if (!row.result) {
    return (
      <div className="mb-2.5 border-2 border-line bg-panel p-2.5" data-testid="interaction-verdict">
        <p className="text-sm font-semibold">{row.name}: could not check</p>
        <p className="mt-1 text-xs text-muted-foreground">{row.error}</p>
        <Heard row={row} onFix={onFix} />
      </div>
    );
  }
  const v = verdictOf(row.result);
  return (
    <div className={cn("mb-2.5 border-2 bg-panel", VERDICT_BORDER[v.verdict])} data-testid="interaction-verdict">
      <div className={cn("flex items-center gap-2 px-2.5 py-2 text-on-domain", VERDICT_BG[v.verdict])}>
        <span className="text-xs font-bold uppercase tracking-[0.06em]">{VERDICT_WORD[v.verdict]}</span>
        <span className="ml-auto text-[0.9375rem] font-semibold">{row.name}</span>
      </div>
      <div className="p-2.5">
        <p className="text-base font-semibold leading-snug">{v.line}</p>
        {v.clashes.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Clashes with <span className="font-medium text-foreground">{v.clashes.join(", ")}</span>
          </p>
        )}
        <Heard row={row} onFix={onFix} />
        {row.result.interactions.length > 0 && (
          <details className="mt-1.5 text-[0.8125rem]">
            <summary className="cursor-pointer py-1 text-xs text-muted-foreground">
              Per medicine ({row.result.interactions.length})
            </summary>
            {row.result.interactions.map((i) => (
              <div key={i.medication} className="flex items-start gap-2 border-t border-line/50 py-1.5">
                <span
                  className={cn(
                    "min-w-16 shrink-0 px-1 py-0.5 text-center text-[10px] font-bold text-on-domain",
                    SEVERITY_BG[i.severity],
                  )}
                >
                  {i.severity}
                </span>
                <span>
                  <b>{i.medication}</b> — {i.description}
                </span>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

/** What was heard, and a way to type the right name when it is wrong. */
function Heard({ row, onFix }: { row: Row; onFix: (name: string) => void }) {
  const [fixing, setFixing] = useState(false);
  const [text, setText] = useState("");
  const sameName = row.heard.trim().toLowerCase() === row.name.trim().toLowerCase();

  if (fixing) {
    return (
      <form
        className="mt-2 border-t border-dashed border-line pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onFix(text.trim());
        }}
      >
        <label htmlFor={`fix-${row.key}`} className="text-[0.8125rem] font-semibold">
          What is it called?
        </label>
        <p className="text-xs text-muted-foreground">Type it, or read it off the box.</p>
        <Input
          id={`fix-${row.key}`}
          autoFocus
          className="my-2"
          value={text}
          placeholder="For example Sudafed"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setFixing(false)}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={!text.trim()}>
            Check this
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={cn(
        "mt-2 flex items-center justify-between gap-2 border-t border-dashed border-line pt-2 text-xs",
        row.unsure ? "text-sodium" : "text-muted-foreground",
      )}
    >
      <span>
        {row.unsure ? (
          <>
            Heard “{row.heard}”. Best guess: <b>{row.name}</b>
          </>
        ) : sameName ? (
          <>Heard “{row.heard}”</>
        ) : (
          <>
            Heard “{row.heard}” · {row.brand ? `${row.brand} is ` : ""}
            {row.name}
          </>
        )}
      </span>
      <button type="button" className="shrink-0 py-1.5 pl-2 font-semibold text-ai" onClick={() => setFixing(true)}>
        {row.unsure ? "Not this?" : "Wrong medicine?"}
      </button>
    </div>
  );
}

/** "What can't I take?": the notes saved on the prescriptions. */
function SavedList({
  list,
  medCount,
}: {
  list: { avoid: SavedCaution[]; careful: SavedCaution[] };
  medCount: number;
}) {
  const group = (verdict: "avoid" | "caution", title: string, items: SavedCaution[]) =>
    items.length > 0 && (
      <section className="mb-3">
        <h3
          className={cn(
            "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
            verdict === "avoid" ? "text-bp" : "text-sodium",
          )}
        >
          {title}
        </h3>
        {items.map((i) => (
          <div
            key={`${i.from}|${i.text}`}
            className={cn(
              "mb-1.5 border border-l-4 border-line bg-panel px-2.5 py-2",
              verdict === "avoid" ? "border-l-bp" : "border-l-sodium",
            )}
          >
            <p className="text-[0.875rem] font-medium leading-snug">{i.text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Because of {i.from}</p>
          </div>
        ))}
      </section>
    );

  const empty = list.avoid.length === 0 && list.careful.length === 0;
  return (
    <>
      {empty ? (
        <p className="border border-line p-3 text-sm">
          {medCount === 0
            ? "You have no active medicines."
            : "Nothing is saved on your medicines yet. Open a medicine in Medications and look it up first. Or ask about a named medicine, for example “Can I take ibuprofen?”"}
        </p>
      ) : (
        <>
          <p className="mb-2.5 border border-line bg-background px-2 py-1.5 text-xs text-muted-foreground">
            From the notes saved on your {medCount} {medCount === 1 ? "medicine" : "medicines"}. To check one
            thing, name it, for example “Can I take ibuprofen?”
          </p>
          {group("avoid", "Do not take", list.avoid)}
          {group("caution", "Careful", list.careful)}
        </>
      )}
    </>
  );
}
