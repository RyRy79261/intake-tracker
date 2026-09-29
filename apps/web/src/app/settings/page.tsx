"use client";

import { ShellIcon } from "@/components/shell/shell-icon";
import { SettingsBody } from "@/components/settings/settings-panel";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";

/**
 * `/settings`. With the Ward Console shell on, the shell renders Home and
 * opens the Settings sheet for this route instead (see AppChrome), so this
 * page only shows with the legacy frame (and in the server render).
 */
export default function SettingsPage() {
  const page = useSettingsSheetStore((s) => s.page);
  const setPage = useSettingsSheetStore((s) => s.setPage);

  return (
    <div className="pb-8">
      {page === "presets" && (
        <div className="mb-1 flex items-center gap-2 border-b border-line">
          <button
            type="button"
            onClick={() => setPage("main")}
            aria-label="Back to settings"
            className="flex h-11 items-center gap-1.5 pr-3 text-sm"
          >
            <ShellIcon name="back" size={20} />
            <span>Settings</span>
          </button>
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em]">Drink presets</h2>
        </div>
      )}
      <SettingsBody />
    </div>
  );
}
