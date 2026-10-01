import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Info,
  Lightbulb,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { domainColor, type Domain } from "@/lib/domain-colors";
import type { Callout, CalloutTone } from "@/lib/help/manuals";

/** Label, domain colour and icon per tone, as in the prototype. */
const TONE: Record<CalloutTone, { icon: LucideIcon; label: string; color: Domain }> = {
  tip: { icon: Lightbulb, label: "Tip", color: "weight" },
  note: { icon: Info, label: "Note", color: "water" },
  warning: { icon: AlertTriangle, label: "Important", color: "sodium" },
  privacy: { icon: ShieldCheck, label: "Privacy", color: "alcohol" },
};

/** A 1px box in the tone's colour with a faint tint of it. */
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
    <div
      data-tone={callout.tone}
      className={cn(
        "flex gap-2.5 border border-[color:var(--c)] bg-[color-mix(in_srgb,var(--c)_10%,transparent)] p-2.5",
        className,
      )}
      style={{ "--c": domainColor(tone.color) } as CSSProperties}
    >
      <Icon className="mt-px h-4 w-4 shrink-0 text-[color:var(--c)]" aria-hidden="true" />
      <div>
        <b className="block text-xs font-semibold text-[color:var(--c)]">{tone.label}</b>
        <p className="mt-0.5 text-[0.8125rem] leading-[1.45] text-foreground">{callout.text}</p>
      </div>
    </div>
  );
}
