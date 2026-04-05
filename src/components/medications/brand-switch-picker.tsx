"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PillIcon } from "@/components/medications/pill-icon";
import { Badge } from "@/components/ui/badge";
import { formatPillCount } from "@/lib/medication-ui-utils";
import {
  useInventoryForPrescription,
  useUpdateInventoryItem,
} from "@/hooks/use-medication-queries";
import { useToast } from "@/hooks/use-toast";
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
  const updateInventory = useUpdateInventoryItem();
  const { toast } = useToast();

  const nonArchived = inventoryItems.filter((item) => !item.isArchived);
  const activeItem = nonArchived.find((item) => item.isActive);

  const handleSelect = async (selectedId: string) => {
    if (selectedId === activeItem?.id) {
      onOpenChange(false);
      return;
    }

    // Deactivate current active
    if (activeItem) {
      await updateInventory.mutateAsync({
        id: activeItem.id,
        updates: { isActive: false },
      });
    }

    // Activate selected
    const selected = nonArchived.find((item) => item.id === selectedId);
    await updateInventory.mutateAsync({
      id: selectedId,
      updates: { isActive: true },
    });

    toast({
      title: "Brand switched",
      description: `Switched to ${selected?.brandName ?? "new brand"}`,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Switch Active Brand</DialogTitle>
        </DialogHeader>
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
                disabled={updateInventory.isPending}
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
                    {item.strength}{item.unit} &middot; {stockText}
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
