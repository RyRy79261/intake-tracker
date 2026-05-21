"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Mic } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VoicePanel } from "@/components/voice/voice-panel";
import { useAuthGate } from "@/components/auth-guard";
import { cn } from "@/lib/utils";

interface VoiceLaunchBarProps {
  /** Whether the bar should slide away (mirrors the QuickNavFooter hide state). */
  hidden: boolean;
  /** Whether the QuickNavFooter is rendered (changes bottom offset). */
  hasQuickNav: boolean;
  transitionDuration?: number;
}

// QuickNavFooter is roughly 76 px tall (py-1.5 + buttons w-14 stacked). We need
// to sit just above it; using a CSS calc against the safe-area inset keeps it
// flush with the bottom of the footer on devices with home indicators.
const QUICK_NAV_HEIGHT_PX = 76;

export function VoiceLaunchBar({
  hidden,
  hasQuickNav,
  transitionDuration = 0.2,
}: VoiceLaunchBarProps) {
  const [open, setOpen] = useState(false);
  const showAi = useAuthGate();

  if (!showAi) return null;

  const bottomOffset = hasQuickNav
    ? `calc(${QUICK_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`
    : "env(safe-area-inset-bottom, 0px)";

  return (
    <>
      <motion.div
        className="pointer-events-none fixed inset-x-0 z-30"
        style={{ bottom: bottomOffset }}
        animate={{ y: hidden ? "150%" : 0, opacity: hidden ? 0 : 1 }}
        transition={{ duration: transitionDuration, ease: "easeInOut" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "pointer-events-auto flex w-full items-center justify-center gap-2",
            "border-t bg-gradient-to-t from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95",
            "backdrop-blur-sm px-4 py-2.5",
            "text-sm font-medium text-muted-foreground transition-colors",
            "hover:bg-muted/40 active:bg-muted/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          )}
          aria-label="Open voice log"
        >
          <span className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-900/50">
            <Mic className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </span>
          <span>Voice log</span>
        </button>
      </motion.div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="full"
          open={open}
          className="flex h-full w-full flex-col overflow-hidden"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Voice log</SheetTitle>
          <VoicePanel onCommitted={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
