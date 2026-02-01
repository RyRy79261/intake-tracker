"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { History, Settings, Lock } from "lucide-react";

interface AppHeaderProps {
  /** Whether the header should be hidden (for scroll-hide behavior) */
  headerHidden: boolean;
  /** Whether to show lock indicators on buttons */
  showLockedUI: boolean;
  /** Callback when history button is clicked */
  onHistoryClick: () => void;
  /** Callback when settings button is clicked */
  onSettingsClick: () => void;
}

export function AppHeader({
  headerHidden,
  showLockedUI,
  onHistoryClick,
  onSettingsClick,
}: AppHeaderProps) {
  return (
    <motion.header
      className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-2 bg-gradient-to-b from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm flex items-center justify-between"
      animate={{ y: headerHidden ? "-100%" : 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Intake Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Daily budget tracking
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 relative"
          onClick={onHistoryClick}
        >
          <History className="w-5 h-5" />
          {showLockedUI && <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-amber-500" />}
          <span className="sr-only">History</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 relative"
          onClick={onSettingsClick}
        >
          <Settings className="w-5 h-5" />
          {showLockedUI && <Lock className="w-3 h-3 absolute -top-0.5 -right-0.5 text-amber-500" />}
          <span className="sr-only">Settings</span>
        </Button>
      </div>
    </motion.header>
  );
}
