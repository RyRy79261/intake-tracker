"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { useMedicationUIStore } from "@/stores/medication-ui-store";
import { cn } from "@/lib/utils";

/**
 * Renders the medications-page floating chrome (the "+" FAB and the
 * AddMedicationWizard dialog) outside the SwipeNav's transformed layer so
 * position:fixed resolves against the viewport. The FAB is only shown on the
 * schedule tab — the other tabs have inline "Add" controls.
 */
export function MedicationsFloatingBars({
  aboveBottomBar = false,
}: {
  /** Lift the FAB clear of the Ward shell's bottom bar. */
  aboveBottomBar?: boolean;
} = {}) {
  const pathname = usePathname();
  const activeTab = useMedicationUIStore((s) => s.activeTab);
  const wizardOpen = useMedicationUIStore((s) => s.wizardOpen);
  const setWizardOpen = useMedicationUIStore((s) => s.setWizardOpen);

  // Close the wizard when the user navigates away from the medications page,
  // so coming back doesn't reopen it mid-flow. Tab state is intentionally
  // preserved.
  useEffect(() => {
    if (pathname !== "/medications") {
      setWizardOpen(false);
    }
  }, [pathname, setWizardOpen]);

  if (pathname !== "/medications") return null;

  return (
    <>
      {activeTab === "schedule" && (
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className={cn(
            "fixed right-4 z-30",
            aboveBottomBar ? "bottom-[calc(56px+env(safe-area-inset-bottom,0px)+16px)]" : "bottom-20",
            "w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg flex items-center justify-center transition-colors active:scale-95",
          )}
          aria-label="Add medication"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
      <AddMedicationWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}
