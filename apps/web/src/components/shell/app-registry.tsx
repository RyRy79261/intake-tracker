"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { MedicationsPageBody } from "@/components/medications/medications-page-body";
import { LogDoseFab } from "@/components/medications/log-dose-fab";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { AnalyticsPageBody, isAnalyticsTab } from "@/components/analytics/analytics-page-body";
import { ProfilePageBody } from "@/components/profile/profile-page-body";
import { HelpIndex } from "@/components/help/help-index";
import { ManualView } from "@/components/help/manual-view";
import { getManual } from "@/lib/help/manuals";
import { useMedicationUIStore } from "@/stores/medication-ui-store";
import { useWindowStore, type Win } from "@/stores/window-store";
import { isFilterType } from "@/lib/history-types";
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
  return <MedicationsPageBody />;
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
      {activeTab === "schedule" && <LogDoseFab />}
      <AddMedicationWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}

/**
 * Metrics: the Analytics screen, its tab and Records filter kept in the
 * window's state (so History and Home's Today rows can open it on Records,
 * filtered to a domain).
 */
function MetricsBody({ win }: WindowBodyProps) {
  const setSt = useWindowStore((s) => s.setSt);
  const tab = isAnalyticsTab(win.st.tab) ? win.st.tab : "summary";
  const filter = isFilterType(win.st.filter) ? win.st.filter : "all";
  return (
    <AnalyticsPageBody
      activeTab={tab}
      onTabChange={(next) => setSt(win.id, { tab: next })}
      recordsFilter={filter}
      onRecordsFilterChange={(next) => setSt(win.id, { filter: next })}
    />
  );
}

function ProfileBody() {
  return <ProfilePageBody />;
}

/**
 * The user manual: the index, or one guide (`st.slug`). Opening a guide and
 * "All guides" change the window's state in place, like the prototype.
 */
function HelpBody({ win }: WindowBodyProps) {
  const setSt = useWindowStore((s) => s.setSt);
  const slug = typeof win.st.slug === "string" ? win.st.slug : null;
  const manual = slug ? getManual(slug) : undefined;
  const topRef = useRef<HTMLDivElement>(null);

  // A new page starts at the top of the window.
  useEffect(() => {
    const body = topRef.current?.closest('[data-testid="window-body"]');
    if (body) body.scrollTop = 0;
  }, [slug]);

  const show = (next: string | null) => setSt(win.id, { slug: next });
  return (
    <div ref={topRef}>
      {manual ? <ManualView manual={manual} onBack={() => show(null)} /> : <HelpIndex onOpen={show} />}
    </div>
  );
}

/**
 * App id -> window content. Each body wraps the existing page content, so a
 * window behaves exactly like the page it replaces.
 */
export const WINDOW_APPS: Record<WindowAppId, WindowApp> = {
  meds: { Body: MedsBody, Overlay: MedsOverlay, flushTop: true },
  metrics: { Body: MetricsBody, flushTop: true },
  profile: { Body: ProfileBody },
  help: { Body: HelpBody },
};
