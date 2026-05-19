import { create } from "zustand";
import type { MedTab } from "@/components/medications/med-footer";

/**
 * Ephemeral UI state for the medications page. Shared with the layout-level
 * MedicationsFloatingBars so the FAB can be rendered outside the SwipeNav's
 * transform layer (where position: fixed against the viewport works) while
 * still reacting to the page's active tab and opening the same wizard.
 *
 * Not persisted — same lifetime semantics as the previous useState pair.
 */
interface MedicationUIState {
  activeTab: MedTab;
  setActiveTab: (tab: MedTab) => void;
  wizardOpen: boolean;
  setWizardOpen: (open: boolean) => void;
}

export const useMedicationUIStore = create<MedicationUIState>((set) => ({
  activeTab: "schedule",
  setActiveTab: (tab) => set({ activeTab: tab }),
  wizardOpen: false,
  setWizardOpen: (open) => set({ wizardOpen: open }),
}));
