"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky header for the /help pages. The global AppHeader hides itself on
 * non-top-level routes, so help pages provide their own bar with a back
 * control. Styling mirrors AppHeader so the transition feels seamless.
 */
export function HelpTopBar({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 -mx-4 mb-2 flex items-center gap-2 bg-gradient-to-b from-slate-50 to-slate-50/95 px-4 py-4 backdrop-blur-sm dark:from-slate-950 dark:to-slate-950/95">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 shrink-0"
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
        <span className="sr-only">Back</span>
      </Button>
      <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}
