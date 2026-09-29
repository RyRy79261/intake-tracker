import type { CSSProperties } from "react";

/*
 * The prototype's `.dlg` modal (ward-console-4.html), used by the cloud
 * migration wizard and the switch-to-local dialog: a panel with a 1px rule,
 * a 3px top stripe in the dialog colour (`--c`), a header (title and muted
 * description), a scrolling body and a ruled footer of equal-width buttons.
 */

/** Dialog shell over the shared centred `DialogContent`/`AlertDialogContent`. */
export const dlgClass =
  "flex max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[460px] flex-col gap-0 border-line bg-panel p-0 shadow-[inset_0_3px_0_var(--c)]";

/** `.dlg-h`: leaves room on the right for the 44px close button. */
export const headClass = "shrink-0 space-y-1 pb-2.5 pl-4 pr-12 pt-3.5 text-left sm:text-left";
export const titleClass = "flex items-center gap-2 text-base font-semibold leading-[1.3]";
export const descClass = "text-[0.8125rem] leading-[1.45]";

/** `.dlg-b` */
export const bodyClass =
  "flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-3.5 pt-0.5 text-sm [&>*]:shrink-0";

/** `.dlg-f`: every direct child takes an equal share of the row. */
export const footClass =
  "flex shrink-0 flex-row gap-2 border-t border-line px-4 py-3 sm:justify-start sm:space-x-0 [&>*]:mt-0 [&>*]:flex-1";

/** `.btn-p.danger`: solid blood-pressure red with on-domain text. */
export const dangerClass =
  "border-2 border-bp bg-bp font-semibold text-on-domain hover:bg-bp/90";

/** `.mig`: the centred column inside the migration wizard's body. */
export const migClass = "flex flex-col items-center gap-2.5 text-center";
export const migHeadingClass = "text-[1.0625rem] font-semibold";
export const migTextClass = "text-sm leading-[1.45] text-muted-foreground";

/** `.tlist`: ruled per-table rows, values in Plex Mono. */
export const tlistClass = "w-full border-t border-line text-left";
export const tlistRowClass =
  "grid min-h-[34px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line text-[0.8125rem]";
export const tlistRowPlainClass =
  "grid min-h-[34px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line text-[0.8125rem]";
export const tlistValueClass = "whitespace-nowrap font-mono text-muted-foreground";

/** Sets the dialog's stripe colour (`--c`) from a CSS colour. */
export function stripe(color: string): CSSProperties {
  return { "--c": color } as CSSProperties;
}

/** A table name such as `bloodPressureRecords` as "Blood Pressure". */
export function tableLabel(name: string): string {
  return name
    .replace(/Records$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}
