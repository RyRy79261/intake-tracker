"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowLeft, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { Button } from "@intake/ui/button";
import { useToast } from "@intake/ui/use-toast";
import { useAuthGate } from "@/components/auth-guard";
import { AiIcon, AI_NOTE } from "@/components/medications/medicine-lookup-panel";
import { PillIcon } from "@/components/medications/pill-icon";
import { Bdg, MLabel, SecHead, WarnBox, type BdgTone } from "@/components/medications/ward-bits";
import { useMedicineAbout } from "@/hooks/use-medicine-about";
import { useRefreshInteractions } from "@/hooks/use-interaction-check";
import { useInventoryForPrescription } from "@/hooks/use-medication-queries";
import {
  isInteractionCheckStale,
  isStoredForOtherName,
  normalizeInteractionCheck,
  normalizeMedicineInfo,
} from "@/lib/medicine-about";
import { isCombo, formatCompoundShort } from "@intake/core/compound";
import type { InteractionCheckRow, Prescription } from "@/lib/db";
import { cn } from "@/lib/utils";

const FOOD_LABEL = { before: "Before eating", after: "After eating" } as const;

const SEVERITY_TONE: Record<InteractionCheckRow["severity"], BdgTone> = {
  AVOID: "bp",
  CAUTION: "sodium",
  OK: "weight",
};
const STRIPE: Record<BdgTone, string> = {
  bp: "shadow-[inset_3px_0_0_hsl(var(--bp))]",
  sodium: "shadow-[inset_3px_0_0_hsl(var(--sodium))]",
  weight: "shadow-[inset_3px_0_0_hsl(var(--weight))]",
  muted: "shadow-[inset_3px_0_0_hsl(var(--muted-foreground))]",
  meds: "shadow-[inset_3px_0_0_hsl(var(--meds))]",
  water: "shadow-[inset_3px_0_0_hsl(var(--water))]",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Sep 2026" (fixed month names: ICU versions differ on "Sept"). */
export function formatAboutDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

/** `.ailk`: the AI-violet busy box. */
const BUSY_BOX =
  "flex min-w-0 flex-col gap-2 border border-ai/50 bg-ai/6 py-2.5 pl-[13px] pr-2.5 shadow-[inset_3px_0_0_hsl(var(--ai))]";
const ERR = "border-l-[3px] border-bp pl-2 text-[0.8125rem]";
const HELP = "text-[0.8125rem] leading-[1.45] text-muted-foreground";

function Busy({ title, sub, onCancel }: { title: string; sub: string; onCancel?: () => void }) {
  return (
    <div className={BUSY_BOX} role="status" aria-live="polite">
      <div className="flex items-start gap-2.5 text-[0.8125rem]">
        <Spinner className="size-4 mt-0.5 shrink-0 text-ai" />
        <div className="min-w-0 flex-1">
          <b className="block font-semibold [overflow-wrap:anywhere]">{title}</b>
          <p className="mt-0.5 leading-[1.4] text-muted-foreground">{sub}</p>
        </div>
      </div>
      {onCancel && (
        <Button variant="outline" className="min-h-11 w-full" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

interface AboutMedicineViewProps {
  prescription: Prescription;
  /**
   * Every prescription, already loaded by the window. The view does not run
   * its own query: a fresh one starts empty, which would show a stored check
   * as stale (and the check button as disabled) until it resolved.
   */
  prescriptions: Prescription[];
  /** Back to the Rx grid. */
  onBack: () => void;
}

/**
 * "About this medicine" (the prototype's `aboutHtml`): an in-window sub-view
 * of the Rx tab. What each compound is for, how it works and its side
 * effects; warnings with what to do; when not to take it; food; pill
 * identification; and the stored interaction check against the user's other
 * active prescriptions, with a stale banner when that list has changed.
 * Both answers are stored on the prescription, so the page works offline;
 * each records the name it was made for and says so when the prescription
 * has been renamed since. A lookup or check keeps running when the view
 * closes (only Cancel stops it).
 * Looking up and checking again are sign-in gated.
 */
export function AboutMedicineView({ prescription, prescriptions, onBack }: AboutMedicineViewProps) {
  const signedIn = useAuthGate();
  const { toast } = useToast();
  const about = useMedicineAbout(prescription.id);
  const ix = useRefreshInteractions(prescription.id);
  const inventory = useInventoryForPrescription(prescription.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "start" });
    // The button that opened this view is now hidden: without this, keyboard
    // and screen-reader focus falls back to the document body.
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const info = normalizeMedicineInfo(prescription.medicineInfo);
  const check = normalizeInteractionCheck(prescription.interactionCheck);
  const others = prescriptions
    .filter((p) => p.id !== prescription.id && p.isActive)
    .map((p) => p.genericName);
  // The prescription was renamed since: the stored answers are for another
  // medicine.
  const infoOtherName = isStoredForOtherName(info, prescription.genericName);
  const checkOtherName = isStoredForOtherName(check, prescription.genericName);
  const stale = check ? checkOtherName || isInteractionCheckStale(check, others) : false;
  const brands = inventory.filter((i) => !i.isArchived);
  const multi = (info?.compounds.length ?? 0) > 1;

  const lookUp = async () => {
    const had = !!info;
    const saved = await about.lookUp(prescription);
    if (saved) {
      toast({
        title: had ? "Medicine information updated" : "Medicine information saved",
        description: "Stored on this prescription.",
      });
    }
  };
  const runCheck = () =>
    void ix.refresh(
      prescription.genericName,
      others.map((genericName) => ({ genericName })),
    );

  // Legacy flat strings from a check made before structured storage.
  const legacy = !check
    ? [...(prescription.contraindications ?? []), ...(prescription.warnings ?? [])].filter(
        (s) => typeof s === "string" && s.trim() !== "",
      )
    : [];

  return (
    <div ref={rootRef} data-testid="about-medicine" className="flex scroll-mt-0 flex-col">
      <div className="sticky top-0 z-[2] -mx-4 flex items-center gap-2.5 border-b border-line bg-panel px-4 py-1.5">
        <Button variant="outline" className="min-h-11 flex-none" onClick={onBack} aria-label="Back to Rx">
          <ArrowLeft aria-hidden="true" />
          Rx
        </Button>
        <div className="min-w-0 flex-1">
          <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold">About this medicine</h3>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{prescription.genericName}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pb-6 pt-3.5">
        {about.busy ? (
          <Busy
            title={`Looking up ${prescription.genericName}`}
            sub="AI searches medical sources. This can take up to a minute."
            onCancel={about.cancel}
          />
        ) : about.error ? (
          <p role="alert" className={ERR}>{about.error}</p>
        ) : null}

        {info ? (
          <>
            {infoOtherName && (
              <WarnBox title="The name changed">
                This information is for {info.forName}, not {prescription.genericName}.{" "}
                {signedIn ? "Refresh it." : "Sign in to refresh it."}
              </WarnBox>
            )}
            <div className="flex min-h-[46px] items-center justify-between gap-2 border border-line bg-background pl-2.5 text-[0.8125rem] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <AiIcon className="text-ai" />
                Updated {formatAboutDate(info.fetchedAt)}
              </span>
              {signedIn ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 rounded-none border-y-0 border-r-0"
                  onClick={() => void lookUp()}
                  disabled={about.busy}
                >
                  <RefreshCw aria-hidden="true" />
                  Refresh
                </Button>
              ) : (
                <span className="pr-2.5">Sign in to refresh</span>
              )}
            </div>

            <SecHead className="mt-2">{multi ? `${info.compounds.length} compounds in each tablet` : "What it is"}</SecHead>
            {info.compounds.map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                className="flex flex-col gap-2.5 border border-line bg-background py-2.5 pl-3.5 pr-3 shadow-[inset_3px_0_0_hsl(var(--meds))]"
              >
                <div>
                  <h4 className="text-[0.9375rem] font-semibold">{c.name}</h4>
                  {c.drugClass && <p className={HELP}>{c.drugClass}</p>}
                </div>
                {c.forText && (
                  <div>
                    <MLabel className="mb-[3px]">What it is for</MLabel>
                    <p className="text-sm leading-[1.45]">{c.forText}</p>
                  </div>
                )}
                {c.howItWorks && (
                  <div>
                    <MLabel className="mb-[3px]">How it works</MLabel>
                    <p className="text-sm leading-[1.45]">{c.howItWorks}</p>
                  </div>
                )}
                {c.sideEffects.length > 0 && (
                  <div>
                    <MLabel className="mb-[3px]">Common side effects</MLabel>
                    <ul className="ml-[1.15em] flex list-disc flex-col gap-1 text-sm leading-[1.45]">
                      {c.sideEffects.map((s, j) => <li key={j}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {(multi || info.compounds.length === 0) && info.drugClass && <p className={HELP}>{info.drugClass}</p>}

            {info.warnings.length > 0 && (
              <>
                <SecHead className="mt-2">Warnings</SecHead>
                <div className="border border-line bg-background px-3">
                  {info.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 border-t border-line py-[9px] text-sm leading-[1.45] first:border-t-0">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-sodium" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-semibold">{w.risk}</p>
                        {w.whatToDo && (
                          <p className="mt-[3px] text-muted-foreground">
                            <span className="mr-1 text-[0.6875rem] font-semibold tracking-[0.06em]">WHAT TO DO</span>
                            {w.whatToDo}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {info.contraindications.length > 0 && (
              <>
                <SecHead className="mt-2">When not to take it</SecHead>
                <ul className="ml-[1.15em] flex list-disc flex-col gap-1 text-sm leading-[1.45]">
                  {info.contraindications.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            )}

            {(info.foodInstruction !== "none" || info.foodNote) && (
              <>
                <SecHead className="mt-2">Food</SecHead>
                <p className="text-sm leading-[1.45]">
                  {info.foodInstruction !== "none" && <b className="font-semibold">{FOOD_LABEL[info.foodInstruction]}. </b>}
                  {info.foodNote}
                </p>
              </>
            )}

            <SecHead className="mt-2">Pill identification</SecHead>
            {brands.length > 0 && (
              <div className="border border-line">
                {brands.map((b) => (
                  <div
                    key={b.id}
                    className="grid min-h-12 grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 border-t border-line bg-panel px-2.5 py-1.5 first:border-t-0"
                  >
                    <PillIcon shape={b.pillShape ?? "round"} color={b.pillColor ?? "#94a3b8"} size={28} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">{b.brandName}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">
                        {isCombo(b) ? formatCompoundShort(b.compounds, b.unit) : `${b.strength}${b.unit}`}
                        {b.pillShape ? ` · ${b.pillShape}` : ""}
                        {b.visualIdentification ? ` · marked ${b.visualIdentification}` : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(info.pillDescription || info.visualIdentification) && (
              <p className={HELP}>
                {[info.pillDescription, info.visualIdentification].filter(Boolean).join(" ")}
              </p>
            )}
          </>
        ) : !about.busy ? (
          signedIn ? (
            <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 border border-ai/50 bg-ai/6 py-3 pl-[15px] pr-3 shadow-[inset_3px_0_0_hsl(var(--ai))]">
              <AiIcon className="h-7 w-7 text-ai" />
              <div>
                <b className="block font-semibold">Look up this medicine with AI</b>
                <p className="mt-[3px] text-[0.8125rem] leading-[1.45] text-muted-foreground">
                  AI finds what it is for, how it works, side effects, warnings and when not to take it. It sends
                  only the name: {prescription.genericName}. The result is saved on this prescription.
                </p>
              </div>
              <Button className="col-span-full min-h-11 border-ai bg-ai text-on-domain hover:bg-ai/90" onClick={() => void lookUp()}>
                <AiIcon />
                Look up with AI
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 border border-line bg-background py-3 pl-[15px] pr-3 shadow-[inset_3px_0_0_hsl(var(--muted-foreground))]">
              <Info className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <div>
                <b className="block font-semibold">No information stored yet</b>
                <p className="mt-[3px] text-[0.8125rem] leading-[1.45] text-muted-foreground">Sign in to look this up.</p>
              </div>
              <Button asChild variant="outline" className="col-span-full min-h-11">
                <a href="/auth">Sign in</a>
              </Button>
            </div>
          )
        ) : null}

        {/* Interactions */}
        <SecHead className="mt-3">Interactions</SecHead>
        <p className={HELP}>
          {others.length > 0
            ? `Checks ${prescription.genericName} against your other active prescriptions: ${others.join(", ")}.`
            : "You have no other active prescriptions to check against."}
        </p>

        {check && (
          <>
            <div className="flex flex-col gap-0.5 text-sm leading-[1.4]" data-testid="interaction-summary">
              <b className="font-semibold">{check.summary}</b>
              <span className="text-xs text-muted-foreground">Checked {formatAboutDate(check.checkedAt)}</span>
            </div>
            {stale &&
              (checkOtherName ? (
                <WarnBox title="The name changed">
                  This check is for {check.forName}, not {prescription.genericName}.{" "}
                  {signedIn ? "Check again." : "Sign in to check again."}
                </WarnBox>
              ) : (
                <WarnBox title="Your medicines changed">
                  This check is older than your current list. Check again.
                </WarnBox>
              ))}
            {check.rows.map((r, i) => {
              const tone: BdgTone = r.notAssessed ? "muted" : SEVERITY_TONE[r.severity];
              return (
                <div
                  key={`${r.medication}-${i}`}
                  data-testid="interaction-row"
                  className={cn(
                    "flex flex-col gap-[5px] border border-line bg-background py-2 pl-[13px] pr-2.5 text-[0.8125rem] leading-[1.45]",
                    STRIPE[tone],
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {r.notAssessed ? (
                      <Bdg tone="muted">NOT ASSESSED</Bdg>
                    ) : (
                      <Bdg tone={tone} kind={r.severity === "OK" ? "outline" : "fill"}>{r.severity}</Bdg>
                    )}
                    <b className="text-sm font-semibold">With {r.medication}</b>
                  </div>
                  <p>{r.description}</p>
                </div>
              );
            })}
          </>
        )}

        {legacy.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="interaction-legacy">
            <p className={HELP}>From an earlier check:</p>
            <ul className="ml-[1.15em] flex list-disc flex-col gap-1 text-[0.8125rem] leading-[1.45]">
              {legacy.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        {ix.isRefreshing ? (
          <Busy title="Checking interactions" sub="AI checks each pair of medicines." />
        ) : ix.error ? (
          <p role="alert" className={ERR}>{ix.error}</p>
        ) : null}

        {signedIn ? (
          !ix.isRefreshing && (
            <Button
              variant="outline"
              className="min-h-11 w-full border-ai text-ai hover:bg-ai/10 hover:text-ai"
              onClick={runCheck}
              disabled={others.length === 0}
            >
              <ShieldCheck aria-hidden="true" />
              {others.length === 0
                ? "Add more prescriptions to check interactions"
                : check
                  ? "Check interactions again"
                  : "Check interactions"}
            </Button>
          )
        ) : (
          <p className={HELP}>
            {check ? "Sign in to check again." : "No interaction check stored. Sign in to check interactions."}
          </p>
        )}

        <p className="mt-1 flex items-start gap-2 text-xs leading-[1.4] text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 flex-none text-ai" aria-hidden="true" />
          <span>{AI_NOTE}</span>
        </p>
      </div>
    </div>
  );
}
