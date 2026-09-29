"use client";

import { useEffect, useState } from "react";
import { DebugPanel } from "@/components/debug-panel";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { useSettingsSheetStore, type SettingsGroupId } from "@/stores/settings-sheet-store";
import { SetGroup, Rule } from "@/components/settings/settings-kit";
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
import { WardShellToggle } from "@/components/settings/ward-shell-toggle";
import { LiquidPresetsSection } from "@/components/settings/liquid-presets-section";

/** Set by the ErrorBoundary crash screen before it navigates to /settings. */
const CRASH_REPORT_KEY = "intake-tracker:crash-report";

/**
 * The settings groups, in the prototype's order. The swipe-navigation,
 * quick-nav and animation-timing sections are retired from the UI (their
 * store keys stay until the cleanup PR).
 */
const GROUPS: ReadonlyArray<{ id: SettingsGroupId; title: string }> = [
  { id: "tracking", title: "Tracking" },
  { id: "appearance", title: "Appearance" },
  { id: "meds", title: "Medications" },
  { id: "ai", title: "AI features" },
  { id: "data", title: "Data & storage" },
  { id: "privacy", title: "Privacy" },
  { id: "system", title: "System" },
  { id: "help", title: "Help & Manual" },
  { id: "feedback", title: "Feedback" },
  { id: "about", title: "About" },
  { id: "debug", title: "Debug" },
];

function GroupBody({ id }: { id: SettingsGroupId }) {
  const setPage = useSettingsSheetStore((s) => s.setPage);
  switch (id) {
    case "tracking":
      return <TrackingSettingsSection onOpenPresets={() => setPage("presets")} />;
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
          <Rule />
          <DataManagementSection />
        </>
      );
    case "privacy":
      return (
        <>
          <PermissionsSection />
          <Rule />
          <MedicalAiSection />
          <Rule />
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
      return (
        <>
          <WardShellToggle />
          <DebugPanel />
        </>
      );
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
      {GROUPS.map(({ id, title }) => (
        <SetGroup key={id} id={id} title={title} open={!!groups[id]} onToggle={() => toggleGroup(id)}>
          <GroupBody id={id} />
        </SetGroup>
      ))}
      <CrashReport />
    </div>
  );
}

/**
 * What the Settings sheet (and the legacy `/settings` page) shows: the
 * groups, or the Drink presets page.
 */
export function SettingsBody() {
  const page = useSettingsSheetStore((s) => s.page);
  return page === "presets" ? <LiquidPresetsSection /> : <SettingsGroups />;
}
