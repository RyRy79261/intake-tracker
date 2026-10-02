"use client";

import type { ReactNode, SyntheticEvent } from "react";

/**
 * Keeps a manual's live preview from leaking into the rest of the app.
 *
 * While a preview is on screen its sample database is swapped in for every
 * `db` consumer. Whatever the user does inside the manual (reading and
 * scrolling it, using the demo and the dialogs the demo opens) is fine; the
 * moment they use anything else (the Log sheet, another window, the sys-bar)
 * the preview must hand the real database back first, or that action would
 * read or write the sample data.
 *
 * `PreviewSafeZone` marks the native events that happen inside the manual.
 * React delivers events through portals along the component tree, so a
 * dialog the demo opens counts as inside even though its DOM lives in
 * `<body>`. `onOutsideInteraction` listens on the document, after React has
 * marked the event, and reports everything else.
 */

const insideEvents = new WeakSet<Event>();

function markInside(event: SyntheticEvent) {
  insideEvents.add(event.nativeEvent);
}

export function PreviewSafeZone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={className}
      onPointerDownCapture={markInside}
      onFocusCapture={markInside}
      onKeyDownCapture={markInside}
    >
      {children}
    </div>
  );
}

/**
 * Also inside, though outside the React tree of the manual:
 * - the rest of the manual's own window (its padding, scrollbar and title
 *   bar; closing it unmounts the preview anyway);
 * - a toast (e.g. the dose "Undo"), rendered by the app-wide toaster but
 *   acting on whatever the demo just did.
 */
const ALSO_INSIDE = '[data-app="help"], [data-swipe-direction]';

function isAlsoInside(target: Element): boolean {
  return target.closest(ALSO_INSIDE) !== null;
}

/**
 * Only a control can read or write data. Touching plain page (to scroll, or
 * the margin around the manual) is not a reason to pause the preview.
 */
const CONTROL =
  'button, a[href], input, textarea, select, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="switch"], [role="slider"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"]';

function isControl(target: Element): boolean {
  return target.closest(CONTROL) !== null;
}

const OUTSIDE_EVENTS = ["pointerdown", "focusin", "keydown"] as const;

/**
 * Calls `onOutside` when a control outside the manual is pressed, focused or
 * typed into.
 */
export function onOutsideInteraction(onOutside: () => void): () => void {
  const handler = (event: Event) => {
    if (insideEvents.has(event)) return;
    const target = event.target;
    if (!(target instanceof Element) || isAlsoInside(target) || !isControl(target)) return;
    onOutside();
  };
  for (const type of OUTSIDE_EVENTS) document.addEventListener(type, handler);
  return () => {
    for (const type of OUTSIDE_EVENTS) document.removeEventListener(type, handler);
  };
}

export { InPreviewProvider, useInPreview } from "@/lib/help/preview-context";
