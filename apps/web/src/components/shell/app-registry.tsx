"use client";

import { useEffect, type ComponentType } from "react";
import { MedicationsPageBody } from "@/components/medications/medications-page-body";
import { LogDoseFab } from "@/components/medications/log-dose-fab";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { AnalyticsPageBody, isAnalyticsTab } from "@/components/analytics/analytics-page-body";
import { ProfilePageBody } from "@/components/profile/profile-page-body";
import { useMedicationUIStore } from "@/stores/medication-ui-store";
import { useWindowStore, type Win } from "@/stores/window-store";
import type { WindowAppId } from "@/lib/nav-routes";

export interface WindowBodyProps {
  win: Win;
}

export interface WindowApp {
  /** The scrolling content of the window. */
  Body: ComponentType<WindowBodyProps>;
  /**
   * Pinned over the content, outside the scroll area (a FAB), plus any
   * dialogs the window owns. Unmounted with the window.
   */
  Overlay?: ComponentType<WindowBodyProps>;
  /** The body starts with its own tab bar, flush under the title bar. */
  flushTop?: boolean;
}

function MedsBody() {
  return <MedicationsPageBody ward />;
}

/**
 * The Medications window's "+" button (Schedule tab; logs an extra dose) and
 * the Add-medication wizard, which the Rx and Meds tabs' Add buttons and the
 * empty schedule open.
 */
function MedsOverlay() {
  const activeTab = useMedicationUIStore((s) => s.activeTab);
  const wizardOpen = useMedicationUIStore((s) => s.wizardOpen);
  const setWizardOpen = useMedicationUIStore((s) => s.setWizardOpen);

  // Closing the window mid-wizard must not reopen the wizard next time.
  useEffect(() => () => setWizardOpen(false), [setWizardOpen]);

  return (
    <>
      {/* "settings" falls back to Schedule in the window (see MedicationsPageBody). */}
      {(activeTab === "schedule" || activeTab === "settings") && <LogDoseFab />}
      <AddMedicationWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}

/** Metrics: the Analytics screen, its tab kept in the window's state. */
function MetricsBody({ win }: WindowBodyProps) {
  const setSt = useWindowStore((s) => s.setSt);
  const tab = isAnalyticsTab(win.st.tab) ? win.st.tab : "summary";
  return <AnalyticsPageBody activeTab={tab} onTabChange={(next) => setSt(win.id, { tab: next })} />;
}

function ProfileBody() {
  return <ProfilePageBody />;
}

/**
 * App id -> window content. Each body wraps the existing page content, so a
 * window behaves exactly like the page it replaces.
 */
export const WINDOW_APPS: Record<WindowAppId, WindowApp> = {
  meds: { Body: MedsBody, Overlay: MedsOverlay, flushTop: true },
  metrics: { Body: MetricsBody },
  profile: { Body: ProfileBody },
};
