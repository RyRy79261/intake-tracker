"use client";

import { useEffect, useState } from "react";
import { DebugPanel } from "@/components/debug-panel";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { useSettingsSheetStore, type SettingsGroupId } from "@/stores/settings-sheet-store";
import { openSettingsPage } from "@/hooks/use-window-history";
import { SetGroup } from "@/components/settings/settings-kit";
import { SETTINGS_GROUP_META, settingsGroupStyle } from "@/components/settings/settings-groups";
import { TrackingSettingsSection } from "@/components/settings/tracking-settings-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { MedicationPrefsSection } from "@/components/settings/medication-prefs-section";
import { AiKeysSection } from "@/components/settings/ai-keys-section";
import { StorageInfoSection } from "@/components/settings/storage-info-section";
import { DataManagementSection } from "@/components/settings/data-management-section";
import { PermissionsSection } from "@/components/settings/permissions-section";
import { MedicalAiSection } from "@/components/settings/medical-ai-section";
import { McpConnectionsSection } from "@/components/settings/mcp-connections-section";
import { AppUpdatesSection } from "@/components/settings/app-updates-section";
import { HelpSection } from "@/components/settings/help-section";
import { ReportBugSection } from "@/components/settings/report-bug-section";
import { AboutSection } from "@/components/settings/about-section";
import { LiquidPresetsSection } from "@/components/settings/liquid-presets-section";

/** Set by the ErrorBoundary crash screen before it navigates to /settings. */
const CRASH_REPORT_KEY = "intake-tracker:crash-report";

/** Drink presets is a sub-page of Tracking. */
export const PRESETS_COLOR = SETTINGS_GROUP_META.find((g) => g.id === "tracking")?.color ?? "water";

function GroupBody({ id }: { id: SettingsGroupId }) {
  switch (id) {
    case "tracking":
      return <TrackingSettingsSection onOpenPresets={() => openSettingsPage("presets")} />;
    case "appearance":
      return <AppearanceSection />;
    case "meds":
      return <MedicationPrefsSection />;
    case "ai":
      return <AiKeysSection />;
    case "data":
      return (
        <>
          <StorageInfoSection />
          <DataManagementSection />
        </>
      );
    case "privacy":
      return (
        <>
          <PermissionsSection />
          <MedicalAiSection />
          <McpConnectionsSection />
        </>
      );
    case "system":
      return <AppUpdatesSection />;
    case "help":
      return <HelpSection />;
    case "feedback":
      return <ReportBugSection />;
    case "about":
      return <AboutSection />;
    case "debug":
      return <DebugPanel />;
  }
}

/**
 * If the crash screen sent the user here ("Report this problem"), open the
 * bug report pre-filled with the caught error.
 */
function CrashReport() {
  const [crash, setCrash] = useState<{ open: boolean; description: string }>({
    open: false,
    description: "",
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CRASH_REPORT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(CRASH_REPORT_KEY);
      const parsed = JSON.parse(raw) as { message?: string; stack?: string };
      const description = [
        "Reporting a crash.",
        parsed.message ? `\n\nError: ${parsed.message}` : "",
        parsed.stack ? `\n\n${parsed.stack}` : "",
      ].join("");
      setCrash({ open: true, description });
    } catch {
      // Malformed / unavailable sessionStorage — nothing to restore.
    }
  }, []);

  return (
    <ReportBugDialog
      open={crash.open}
      onOpenChange={(open) => setCrash((c) => ({ ...c, open }))}
      defaultType="bug"
      defaultDescription={crash.description}
    />
  );
}

/** The collapsible settings groups. */
export function SettingsGroups() {
  const groups = useSettingsSheetStore((s) => s.groups);
  const toggleGroup = useSettingsSheetStore((s) => s.toggleGroup);

  return (
    <div className="border-b border-line [&>section:first-child]:border-t-0">
      {SETTINGS_GROUP_META.map(({ id, title, icon, color }) => (
        <SetGroup
          key={id}
          id={id}
          title={title}
          icon={icon}
          color={color}
          open={!!groups[id]}
          onToggle={() => toggleGroup(id)}
        >
          <GroupBody id={id} />
        </SetGroup>
      ))}
      <CrashReport />
    </div>
  );
}

/**
 * What the Settings sheet shows: the groups, or the Drink presets page.
 * Drink presets belongs to Tracking, so it keeps Tracking's colour.
 */
export function SettingsBody() {
  const page = useSettingsSheetStore((s) => s.page);
  if (page !== "presets") return <SettingsGroups />;
  return (
    <div
      className="px-3.5 shadow-[inset_3px_0_0_var(--g)]"
      data-testid="settings-presets-page"
      data-settings-color={PRESETS_COLOR}
      style={settingsGroupStyle(PRESETS_COLOR)}
    >
      <LiquidPresetsSection />
    </div>
  );
}
