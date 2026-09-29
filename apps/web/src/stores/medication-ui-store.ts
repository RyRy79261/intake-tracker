import { create } from "zustand";
import type { MedTab } from "@/components/medications/med-tabs";

/**
 * Ephemeral UI state for the Medications window: the active tab and the
 * Add-medication wizard, shared between the window body and its overlay
 * (the "+" button and the wizard), and read by the Windows switcher.
 *
 * Not persisted.
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
