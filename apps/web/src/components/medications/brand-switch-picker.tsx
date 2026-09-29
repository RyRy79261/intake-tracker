"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { PillIcon } from "@/components/medications/pill-icon";
import { Bdg, WarnBox, dlgClass } from "@/components/medications/ward-bits";
import { cn } from "@/lib/utils";
import { formatPillCount } from "@/lib/medication-ui-utils";
import { isCombo, formatCompoundShort } from "@intake/core/compound";
import { useInventoryForPrescription } from "@/hooks/use-medication-queries";
import { useSetActiveBrand } from "@/hooks/use-inventory-mutations";
import { useToast } from "@intake/ui/use-toast";
import { isLive } from "@intake/core/lifecycle";
import { Check } from "lucide-react";

interface BrandSwitchPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptionId: string;
}

export function BrandSwitchPicker({
  open,
  onOpenChange,
  prescriptionId,
}: BrandSwitchPickerProps) {
  const inventoryItems = useInventoryForPrescription(prescriptionId);
  const setActiveBrand = useSetActiveBrand();
  const { toast } = useToast();

  const nonArchived = inventoryItems.filter((item) => isLive(item) && !item.isArchived);
  const activeItem = nonArchived.find((item) => item.isActive);

  const handleSelect = (selectedId: string) => {
    if (selectedId === activeItem?.id) {
      onOpenChange(false);
      return;
    }

    // One transaction: activates the selection and deactivates every other
    // brand, so the prescription never ends up with zero or two active.
    const selected = nonArchived.find((item) => item.id === selectedId);
    setActiveBrand.mutate(
      { prescriptionId, itemId: selectedId },
      {
        onSuccess: () => {
          toast({
            title: "Brand switched",
            description: `Switched to ${selected?.brandName ?? "new brand"}`,
          });
          onOpenChange(false);
        },
        onError: (e) => toast({ title: "Could not switch brand", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dlgClass}>
        <DialogHeader className="px-4 pb-2.5 pr-12 pt-3.5 text-left">
          <DialogTitle className="text-base font-semibold">Switch Active Brand</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 overflow-auto px-4 pb-4">
        {!activeItem && nonArchived.length > 0 && (
          <WarnBox>
            No active brand: doses are not deducted from any stock. Pick the
            box you are taking pills from.
          </WarnBox>
        )}
        <div className="border border-line">
          {nonArchived.map((item) => {
            const stock = item.currentStock ?? 0;
            const isFractional = stock % 1 !== 0;
            const stockText = isFractional
              ? formatPillCount(stock)
              : `${stock} pills`;

            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.isActive}
                className={cn(
                  "grid min-h-[52px] w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line bg-panel px-2.5 py-1.5 text-left first:border-t-0",
                  "hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  item.isActive && "shadow-[inset_3px_0_0_hsl(var(--meds))]",
                )}
                onClick={() => handleSelect(item.id)}
                disabled={setActiveBrand.isPending}
              >
                <PillIcon
                  shape={item.pillShape ?? "round"}
                  color={item.pillColor ?? "#94a3b8"}
                  size={28}
                />
                <div className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">
                    {item.brandName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {isCombo(item)
                      ? formatCompoundShort(item.compounds, item.unit)
                      : `${item.strength}${item.unit}`}
                    {" "}&middot; {stockText}
                  </span>
                </div>
                {item.isActive ? (
                  <Bdg tone="weight" kind="fill">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Active
                  </Bdg>
                ) : (
                  <span />
                )}
              </button>
            );
          })}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
