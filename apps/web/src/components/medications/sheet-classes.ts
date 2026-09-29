/**
 * Turns the shared centred `DialogContent` into the prototype's bottom sheet
 * (`.rxm .sheet2`): full width up to the app column, pinned to the bottom,
 * a 2px ink rule on top, sliding up instead of zooming in. Used by the dose
 * pop-ups (skip reason, time picker) so they sit over the thumb, like the
 * rest of the Ward Console sheets.
 */
export const bottomSheetClass = [
  "top-auto bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 translate-y-0",
  "gap-3 border-0 border-t-2 border-foreground bg-panel px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))]",
  // Slide from below (the base content zooms in from the centre).
  "[--tw-enter-translate-y:100%]! [--tw-exit-translate-y:100%]! [--tw-enter-scale:1]! [--tw-exit-scale:1]!",
].join(" ");
