"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp } from "lucide-react";
import { usePrescriptions, useTitrationPlans } from "@/hooks/use-medication-queries";
import type { TitrationPlan } from "@/lib/db";
import { MaintenanceRow } from "@/components/medications/titrations/maintenance-row";
import { TitrationPlanCard } from "@/components/medications/titrations/titration-plan-card";
import { TitrationDrawer } from "@/components/medications/titrations/titration-drawer";

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
    <div className="space-y-4 pb-24 px-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Manage dosage adjustments across prescriptions.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => { setEditingPlan(null); setDrawerOpen(true); }}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            No titration plans yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Create a plan to adjust dosages across prescriptions.
          </p>
        </div>
      ) : (
        <>
          {activePlans.length > 0 && (
            <Section label="Active">
              {activePlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => openForEdit(plan)} />
              ))}
            </Section>
          )}

          {draftPlans.length > 0 && (
            <Section label="Planned">
              {draftPlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => openForEdit(plan)} />
              ))}
            </Section>
          )}

          {pastPlans.length > 0 && (
            <Section label="Past">
              {pastPlans.map((plan) => (
                <TitrationPlanCard key={plan.id} plan={plan} onEdit={() => openForEdit(plan)} />
              ))}
            </Section>
          )}
        </>
      )}

      {activePrescriptions.length > 0 && (
        <Section label="Current Maintenance">
          <div className="space-y-2">
            {activePrescriptions
              .sort((a, b) => a.genericName.localeCompare(b.genericName))
              .map((rx) => (
                <MaintenanceRow key={rx.id} prescription={rx} />
              ))}
          </div>
        </Section>
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

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </h3>
      {children}
    </div>
  );
}

