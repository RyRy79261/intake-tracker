"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@intake/ui/sheet";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";
import { closeSettings, closeSettingsPage } from "@/hooks/use-window-history";
import { ShellIcon } from "@/components/shell/shell-icon";
import { SettingsBody } from "@/components/settings/settings-panel";

const titleClass = "flex-1 text-[0.8125rem] font-semibold uppercase leading-[1.15] tracking-[0.06em]";

/**
 * The global Settings sheet (Ward Console). Opened by the sys-bar gear or the
 * `/settings` deep link, over Home and any open windows. Full screen under
 * the sys-bar on a phone; a 420px panel on the right when wide. Its Drink
 * presets page has a Back button to the groups.
 */
export function SettingsSheet() {
  const open = useSettingsSheetStore((s) => s.open);
  const page = useSettingsSheetStore((s) => s.page);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSettings();
      }}
    >
      <SheetContent
        side="right"
        open={open}
        data-testid="settings-sheet"
        // Focus the sheet itself rather than the first group button, so
        // opening it doesn't draw a focus ring on "Tracking".
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
        overlayClassName="top-[calc(44px+env(safe-area-inset-top,0px))] bg-transparent md:bg-black/45"
        className={
          "flex flex-col gap-0 bg-panel p-0 outline-none " +
          // Phone: everything under the sys-bar.
          "left-0 right-0 bottom-0 top-[calc(44px+env(safe-area-inset-top,0px))] h-auto w-full max-w-none border-l-0 sm:max-w-none " +
          // Wide: a panel on the right.
          "md:left-auto md:bottom-auto md:right-1.5 md:top-[calc(50px+env(safe-area-inset-top,0px))] md:max-h-[calc(100dvh-56px-env(safe-area-inset-top,0px))] md:w-[420px] md:border md:border-t-2 md:border-foreground md:border-l-foreground md:shadow-[6px_6px_0_rgba(20,22,31,.22)] md:dark:shadow-[6px_6px_0_rgba(0,0,0,.5)]"
        }
      >
        {page === "presets" ? (
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-chrome pr-12">
            <button
              type="button"
              onClick={() => closeSettingsPage()}
              aria-label="Back to settings"
              className="flex h-12 shrink-0 items-center gap-1.5 border-r border-line pl-2 pr-3 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <ShellIcon name="back" size={20} />
              <span>Settings</span>
            </button>
            <SheetTitle className={`${titleClass} pl-2`}>Drink presets</SheetTitle>
          </div>
        ) : (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-chrome pl-3.5 pr-12">
            <ShellIcon name="gear" size={20} />
            <SheetTitle className={titleClass}>Settings</SheetTitle>
          </div>
        )}
        <SheetDescription className="sr-only">
          {page === "presets"
            ? "Add, edit and delete the drinks on the Liquids card."
            : "Tracking, appearance, medications, data and app preferences."}
        </SheetDescription>
        <div
          key={page}
          className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-[calc(18px+env(safe-area-inset-bottom,0px))]"
          data-testid="settings-sheet-body"
        >
          <SettingsBody />
        </div>
      </SheetContent>
    </Sheet>
  );
}
