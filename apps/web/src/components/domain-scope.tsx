import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type { DomainScope } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the domain scope (`data-domain`, see
 * packages/ui/src/styles/globals.css and lib/domain-colors.ts). A scope on a
 * card, window or dialog tints its primary button, selected segments,
 * switches, focus rings and carets through the shared primitives; the pieces
 * here add the few marks the primitives cannot: a field's own colour, its pip,
 * a selected option, a unit and a disclosure row. Sub-headings use the
 * `subhead` utility.
 */

/**
 * A field that belongs to another domain than its card (the sugar field on the
 * Food card): its focus ring, caret and pip take `domain`.
 */
export function FieldScope({
  domain,
  className,
  children,
  ...rest
}: { domain: DomainScope } & ComponentPropsWithoutRef<"div">) {
  return (
    <div data-domain={domain} className={className} {...rest}>
      {children}
    </div>
  );
}

/**
 * The 6px square before a field label, in the scope colour. Decorative: the
 * label names the domain, so colour is never the only cue.
 */
export function Pip({ className }: { className?: string }) {
  return <i aria-hidden="true" data-pip="" className={cn("pip mr-1.5 align-[0.0625rem]", className)} />;
}

/**
 * A selected segment, chip or toggle button: filled with the scope colour
 * (ink outside a scope), like the prototype's `.seg [aria-checked=true]`.
 * Pair it with `aria-pressed` / `aria-checked`, so colour is not the only cue.
 */
export const segOnClass =
  "border-primary bg-primary font-semibold text-primary-foreground hover:bg-(--primary-hover) hover:text-primary-foreground";

/**
 * A selected option in a row of toggle buttons that sit next to the card's
 * primary action (Position / Arm on the Blood Pressure card): a 2px outline,
 * a square mark and the label in the scope colour, not a fill. Several rows of
 * filled blocks above a filled primary button read as a wall of colour; the
 * fill stays reserved for the one action and the one chosen amount.
 */
export const optOnClass =
  "relative border-primary font-semibold text-[color:var(--c,hsl(var(--fg)))] shadow-[inset_0_0_0_1px_hsl(var(--primary))] before:absolute before:left-3 before:top-1/2 before:size-1.5 before:-translate-y-1/2 before:bg-primary before:content-['']";

/**
 * A unit or suffix beside a field ("BPM"), in the scope colour. Only on the
 * panel surface: inside an input (the darker `--bg`) some domain colours fall
 * under AA as text, so a unit there stays muted.
 */
export const unitClass = "num text-[color:var(--c,hsl(var(--muted-fg)))]";

/**
 * A disclosure row ("More options", "Set different time"): a full-width
 * button, 36px like the small button it replaces, labelled in the sub-heading
 * style with the hairline running to the chevron.
 */
export function SubToggle({
  expanded,
  onToggle,
  icon: Icon,
  className,
  children,
  ...rest
}: {
  expanded: boolean;
  onToggle: () => void;
  icon?: LucideIcon;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "onClick" | "type">) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        // 4%, not the usual 6%: the label is domain-coloured text, and a
        // darker hover surface drops the greens under AA.
        "flex h-9 w-full items-center gap-2 text-left hover:bg-foreground/4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...rest}
    >
      <span className="subhead min-w-0 flex-1">
        {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
        {children}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0 text-muted-foreground", expanded && "rotate-180")}
      />
    </button>
  );
}
