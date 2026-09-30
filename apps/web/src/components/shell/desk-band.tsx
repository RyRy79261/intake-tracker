"use client";

import { useState, type CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import { useAuthGate } from "@/components/auth-guard";
import { HoldToTalk } from "@/components/shell/hold-to-talk";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { ShellIcon } from "@/components/shell/shell-icon";
import { DESK_MODULES, MODULE_IDS, type ModuleId } from "@/lib/desk-modules";
import { focusWindowTitle } from "@/hooks/use-shell-mode";
import { useModuleWindowStore } from "@/stores/module-window-store";

/** Height of the desk band; windows cannot go under it (`--bbh` in ward-desktop.css). */
export const DESK_BAND_HEIGHT_PX = 72;

const tile =
  "relative flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border bg-panel text-foreground " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A minimised module on the desk: a square tile with the module's icon in
 * its colour and a short label. Click (or Enter) puts the window back where
 * it was, in front.
 */
export function DeskIcon({ id }: { id: ModuleId }) {
  const meta = DESK_MODULES[id];
  return (
    <button
      type="button"
      data-testid="desk-icon"
      data-desk-icon={id}
      className={`${tile} border-line hover:border-foreground`}
      style={{ "--c": meta.color } as CSSProperties}
      aria-label={`Open ${meta.title}`}
      title={`Open ${meta.title}`}
      onClick={() => {
        useModuleWindowStore.getState().restore(id);
        focusWindowTitle(`m-${id}`);
      }}
    >
      <ShellIcon name={meta.icon} size={20} className="text-[color:var(--c)]" />
      <span className="max-w-full truncate px-0.5 text-[0.6875rem] font-medium leading-none">{meta.short}</span>
    </button>
  );
}

/**
 * Desktop mode's desk band: the strip of desk along the bottom that windows
 * leave free. Left: the hazard button (report a bug or ask for a feature),
 * then the icon of every minimised module. Right: Hold to talk, when signed
 * in. `modules` is false on pages that are not the desk (e.g. /privacy).
 */
export function DeskBand({ modules = true }: { modules?: boolean }) {
  const showAi = useAuthGate();
  const wins = useModuleWindowStore((s) => s.wins);
  const [bugOpen, setBugOpen] = useState(false);
  const minimised = modules ? MODULE_IDS.filter((id) => wins[id].min) : [];

  return (
    <>
      <div
        data-testid="desk-band"
        className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(72px+env(safe-area-inset-bottom,0px))] items-start gap-2 border-t border-line bg-background px-2 pb-[env(safe-area-inset-bottom,0px)] pt-[7px]"
      >
        <button
          type="button"
          className={`${tile} border-muted-foreground hover:border-foreground`}
          aria-label="Report a bug"
          aria-haspopup="dialog"
          title="Report a bug or ask for a feature"
          onClick={() => setBugOpen(true)}
        >
          <TriangleAlert aria-hidden="true" className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-[0.6875rem] font-medium leading-none">Report</span>
        </button>
        {/* Always in the tree, so a screen reader hears a module arrive. */}
        <ul aria-label="Minimised modules" className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden pl-2">
          {minimised.map((id) => (
            <li key={id}>
              <DeskIcon id={id} />
            </li>
          ))}
        </ul>
        {showAi && <HoldToTalk variant="corner" />}
      </div>
      <ReportBugDialog open={bugOpen} onOpenChange={setBugOpen} defaultType="bug" />
    </>
  );
}
