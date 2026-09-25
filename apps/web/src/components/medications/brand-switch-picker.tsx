"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { PillIcon } from "@/components/medications/pill-icon";
import { Badge } from "@intake/ui/badge";
import { formatPillCount } from "@/lib/medication-ui-utils";
import { isCombo, formatCompoundShort } from "@intake/core/compound";
import { useInventoryForPrescription } from "@/hooks/use-medication-queries";
import { useSetActiveBrand } from "@/hooks/use-inventory-mutations";
import { useToast } from "@intake/ui/use-toast";
import { isLive } from "@intake/core/lifecycle";
import { AlertTriangle, Check } from "lucide-react";

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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Switch Active Brand</DialogTitle>
        </DialogHeader>
        {!activeItem && nonArchived.length > 0 && (
          <p className="flex gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            No active brand: doses are not deducted from any stock. Pick the
            box you are taking pills from.
          </p>
        )}
        <div className="space-y-1.5 mt-2">
          {nonArchived.map((item) => {
            const stock = item.currentStock ?? 0;
            const isFractional = stock % 1 !== 0;
            const stockText = isFractional
              ? formatPillCount(stock)
              : `${stock} pills`;

            return (
              <button
                key={item.id}
                className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                onClick={() => handleSelect(item.id)}
                disabled={setActiveBrand.isPending}
              >
                <PillIcon
                  shape={item.pillShape ?? "round"}
                  color={item.pillColor ?? "#94a3b8"}
                  size={28}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">
                      {item.brandName}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isCombo(item)
                      ? formatCompoundShort(item.compounds, item.unit)
                      : `${item.strength}${item.unit}`}
                    {" "}&middot; {stockText}
                  </span>
                </div>
                {item.isActive && (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] px-1.5 py-0 border-emerald-500 text-emerald-600 dark:text-emerald-400 gap-0.5"
                  >
                    <Check className="w-3 h-3" />
                    Active
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
