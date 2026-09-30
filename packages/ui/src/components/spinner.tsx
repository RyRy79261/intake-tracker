import * as React from "react"

import { cn } from "../lib/utils"

/**
 * The Ward Console spinner (the prototype's `.spin`): a 14px round ring, a
 * faint track in the current text colour with a bright top arc, one turn
 * every 0.8s. Colour it with a `text-*` class and size it with `size-*`.
 * Decorative by default; pass `label` to announce it as a status.
 */
const Spinner = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { label?: string }
>(({ className, label, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="spinner"
    {...(label
      ? { role: "status", "aria-label": label }
      : { "aria-hidden": true })}
    className={cn(
      "inline-block size-3.5 shrink-0 animate-[spin_0.8s_linear_infinite] rounded-full border-2 border-current/25 border-t-current",
      className
    )}
    {...props}
  />
))
Spinner.displayName = "Spinner"

export { Spinner }
