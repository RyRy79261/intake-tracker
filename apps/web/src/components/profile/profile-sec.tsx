import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Ward Console section label (the prototype's `.sec`), in the same style as a
 * Settings sub-heading: mono caps followed by a 1px rule that runs to the
 * edge. It takes the colour of the section's `data-domain` scope, or the
 * muted text colour outside one.
 */
export function ProfileSec({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h3
      id={id}
      // The line height stays at the old label's, so nothing below moves.
      className={cn("subhead mb-1.5 mt-3.5 leading-[1.15]! text-[color:var(--c,hsl(var(--muted-fg)))]", className)}
    >
      <span>{children}</span>
    </h3>
  );
}

/** Key-value grid (the prototype's `.kv`): muted terms, a 9em term column. */
export const kvClass =
  "grid grid-cols-[9em_1fr] gap-x-3 gap-y-1 text-[0.9375rem] [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dt]:leading-6 [&_dd]:m-0 [&_dd]:min-w-0";
