"use client";

import { useState } from "react";
import { Button } from "@intake/ui/button";
import { Plus, TrendingUp } from "lucide-react";
import { usePrescriptions, useTitrationPlans } from "@/hooks/use-medication-queries";
import type { TitrationPlan } from "@/lib/db";
import { MaintenanceRow } from "@/components/medications/titrations/maintenance-row";
import { TitrationPlanCard } from "@/components/medications/titrations/titration-plan-card";
import { TitrationDrawer } from "@/components/medications/titrations/titration-drawer";
import { TitrationStartPrompt } from "@/components/medications/titrations/titration-start-prompt";
import { SecHead } from "@/components/medications/ward-bits";

/**
 * The Titrations tab: plans grouped Active / Planned / Past, then every
 * active prescription's current maintenance schedule. A planned step only
 * starts once the user confirms it ("Start now" / Activate).
 */
export function TitrationsView() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TitrationPlan | null>(null);
  const prescriptions = usePrescriptions();
  const plans = useTitrationPlans();

  const activePlans = plans.filter((p) => p.status === "active");
  const draftPlans = plans.filter((p) => p.status === "draft");
  const pastPlans = plans.filter(
    (p) => p.status === "completed" || p.status === "cancelled",
  );

  const activePrescriptions = prescriptions.filter((p) => p.isActive);

  const openForEdit = (plan: TitrationPlan) => {
    setEditingPlan(plan);
    setDrawerOpen(true);
  };

  return (
    <div className="pb-6">
      <div className="mb-1 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted-foreground">
          Manage dosage adjustments across prescriptions.
        </p>
        <Button onClick={() => { setEditingPlan(null); setDrawerOpen(true); }}>
          <Plus aria-hidden="true" />
          New
        </Button>
      </div>

      <TitrationStartPrompt className="mt-3" />

      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
          <TrendingUp className="h-12 w-12 opacity-50" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-lg font-semibold">No titration plans yet</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            Create a plan to adjust dosages across prescriptions.
          </p>
        </div>
      ) : (
        <>
          {activePlans.length > 0 && (
            <section>
              <SecHead className="first:mt-3.5">Active</SecHead>
              {activePlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => openForEdit(plan)} />
              ))}
            </section>
          )}

          {draftPlans.length > 0 && (
            <section>
              <SecHead className="first:mt-3.5">Planned</SecHead>
              {draftPlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => openForEdit(plan)} />
              ))}
            </section>
          )}

          {pastPlans.length > 0 && (
            <section>
              <SecHead className="first:mt-3.5">Past</SecHead>
              {pastPlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => openForEdit(plan)} />
              ))}
            </section>
          )}
        </>
      )}

      {activePrescriptions.length > 0 && (
        <section>
          <SecHead className="first:mt-3.5">Current maintenance</SecHead>
          {activePrescriptions
            .sort((a, b) => a.genericName.localeCompare(b.genericName))
            .map((rx) => (
              <MaintenanceRow key={rx.id} prescription={rx} />
            ))}
        </section>
      )}

      <TitrationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prescriptions={activePrescriptions}
        editingPlan={editingPlan}
      />
    </div>
  );
}
