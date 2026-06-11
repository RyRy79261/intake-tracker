import {
  AlertTriangle,
  Info,
  Lightbulb,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Callout, CalloutTone } from "@/lib/help/manuals";

const TONE: Record<
  CalloutTone,
  { icon: LucideIcon; label: string; wrap: string; mark: string }
> = {
  tip: {
    icon: Lightbulb,
    label: "Tip",
    wrap: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    mark: "text-emerald-600 dark:text-emerald-400",
  },
  note: {
    icon: Info,
    label: "Note",
    wrap: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
    mark: "text-sky-600 dark:text-sky-400",
  },
  warning: {
    icon: AlertTriangle,
    label: "Important",
    wrap: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    mark: "text-amber-600 dark:text-amber-400",
  },
  privacy: {
    icon: ShieldCheck,
    label: "Privacy",
    wrap: "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40",
    mark: "text-violet-600 dark:text-violet-400",
  },
};

export function ManualCallout({
  callout,
  className,
}: {
  callout: Callout;
  className?: string;
}) {
  const tone = TONE[callout.tone];
  const Icon = tone.icon;
  return (
    <div className={cn("flex gap-2.5 rounded-lg border p-3", tone.wrap, className)}>
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", tone.mark)} />
      <div className="space-y-0.5">
        <p className={cn("text-xs font-semibold", tone.mark)}>{tone.label}</p>
        <p className="text-xs leading-relaxed text-foreground/80">{callout.text}</p>
      </div>
    </div>
  );
}
