"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Mic } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { VoicePanel } from "@/components/experimental/voice-panel";
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

  const bottomOffset = hasQuickNav
    ? `calc(${QUICK_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`
    : "env(safe-area-inset-bottom, 0px)";

  return (
    <>
      <motion.div
        className="pointer-events-none fixed inset-x-0 z-30 px-3"
        style={{ bottom: bottomOffset }}
        animate={{ y: hidden ? "150%" : 0, opacity: hidden ? 0 : 1 }}
        transition={{ duration: transitionDuration, ease: "easeInOut" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "pointer-events-auto flex w-full items-center justify-center gap-2",
            "rounded-full border border-primary/30 bg-primary/90 px-4 py-2.5",
            "text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20",
            "backdrop-blur transition-all",
            "hover:bg-primary active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-label="Open voice log"
        >
          <Mic className="h-4 w-4" />
          <span>Voice log</span>
        </button>
      </motion.div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="full"
          open={open}
          className="flex h-full w-full flex-col overflow-hidden"
        >
          <VoicePanel onCommitted={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
