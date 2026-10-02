"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { LogDoseDialog } from "@/components/medications/log-dose-dialog";

/**
 * The Medications window's "+" button (Schedule tab): opens "Log a dose".
 * Pinned to the window's bottom right corner, over the scroll area; the
 * schedule leaves room under its last row for it.
 */
export function LogDoseFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-3.5 right-3.5 z-[4] flex h-14 w-14 items-center justify-center bg-meds text-on-domain shadow-[0_3px_0_rgba(20,22,31,.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px dark:shadow-[0_3px_0_rgba(0,0,0,.5)] md:bottom-[22px] md:right-[22px]"
        aria-label="Log a dose"
      >
        <Plus className="h-7 w-7" strokeWidth={1.75} />
      </button>
      <LogDoseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
