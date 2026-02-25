"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillIcon } from "./pill-icon";
import { 
  usePhasesForPrescription, 
  useInventoryForPrescription, 
  useStartNewPhase 
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { Loader2, Plus, Clock, Pill } from "lucide-react";
import { format } from "date-fns";

interface PrescriptionViewDrawerProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrescriptionViewDrawer({ prescription, open, onOpenChange }: PrescriptionViewDrawerProps) {
  if (!prescription) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{prescription.genericName}</DrawerTitle>
          <p className="text-sm text-muted-foreground">{prescription.indication}</p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details" className="w-full h-full flex flex-col">
            <div className="px-4 pt-4 shrink-0 border-b">
              <TabsList className="w-full grid grid-cols-2 h-auto p-1 bg-muted/50 rounded-lg mb-4">
                <TabsTrigger value="details" className="py-2 text-xs">Details</TabsTrigger>
                <TabsTrigger value="titration" className="py-2 text-xs">Titration / Phases</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="details" className="mt-0 space-y-6">
                <DetailsTab prescription={prescription} />
              </TabsContent>

              <TabsContent value="titration" className="mt-0">
                <TitrationTab prescription={prescription} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DetailsTab({ prescription }: { prescription: Prescription }) {
  const { data: inventory = [], isLoading } = useInventoryForPrescription(prescription.id);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeItem = inventory.find(i => i.isActive) || inventory[0];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Pill className="w-4 h-4" /> Current Inventory
        </h3>
        
        {activeItem ? (
          <div className="p-4 rounded-xl border bg-card space-y-4">
            <div className="flex items-start gap-4">
              <PillIcon shape={activeItem.pillShape} color={activeItem.pillColor} size={40} />
              <div>
                <p className="font-medium">{activeItem.brandName || prescription.genericName}</p>
                <p className="text-sm text-muted-foreground">
                  {activeItem.currentStock} pills remaining
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-muted-foreground text-xs mb-1">Color</p>
                <p className="font-medium capitalize">{activeItem.pillColor}</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-muted-foreground text-xs mb-1">Shape</p>
                <p className="font-medium capitalize">{activeItem.pillShape}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No inventory items found.</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Notes</h3>
        <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
          {prescription.notes || "No notes added."}
        </p>
      </div>
    </div>
  );
}

function TitrationTab({ prescription }: { prescription: Prescription }) {
  const { data: phases = [], isLoading } = usePhasesForPrescription(prescription.id);
  const startNewPhase = useStartNewPhase();
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [dosageStrength, setDosageStrength] = useState("");
  const [dosageAmount, setDosageAmount] = useState(1);
  const [type, setType] = useState<"maintenance" | "titration">("titration");
  const [time, setTime] = useState("08:00");

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleStartPhase = async () => {
    if (!dosageStrength) return;

    await startNewPhase.mutateAsync({
      prescriptionId: prescription.id,
      type,
      dosageAmount,
      dosageStrength,
      startDate: Date.now(),
      foodInstruction: "none",
      schedules: [
        { time, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }
      ]
    });
    
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> Dosage History
        </h3>
        {!isAdding && (
          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setIsAdding(true)}>
            <Plus className="w-3 h-3" /> New Phase
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-50/30 dark:bg-teal-950/10 space-y-4 mb-6">
          <h4 className="font-medium text-sm">Start New Dosage Phase</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select 
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="maintenance">Maintenance</option>
                <option value="titration">Titration</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs">Strength (e.g. 75mg)</Label>
              <Input 
                value={dosageStrength} 
                onChange={(e) => setDosageStrength(e.target.value)} 
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Pills per dose</Label>
              <Input 
                type="number" 
                step="0.5" 
                min="0.5" 
                value={dosageAmount} 
                onChange={(e) => setDosageAmount(parseFloat(e.target.value))} 
                className="h-9"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs">Daily Time</Label>
              <Input 
                type="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)} 
                className="h-9"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button 
              size="sm" 
              className="bg-teal-600 hover:bg-teal-700" 
              onClick={handleStartPhase}
              disabled={startNewPhase.isPending || !dosageStrength}
            >
              {startNewPhase.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Start Phase"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {phases.map((phase) => (
          <div 
            key={phase.id} 
            className={`p-4 rounded-xl border relative overflow-hidden ${
              phase.status === "active" 
                ? "bg-card border-teal-500/50 shadow-sm" 
                : "bg-muted/30 border-dashed opacity-70"
            }`}
          >
            {phase.status === "active" && (
              <div className="absolute top-0 right-0 w-1.5 h-full bg-teal-500" />
            )}
            
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                phase.type === "titration" 
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" 
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}>
                {phase.type === "titration" ? "Titration" : "Maintenance"}
              </span>
              
              <span className="text-xs text-muted-foreground">
                {format(phase.startDate, "MMM d, yyyy")}
                {phase.endDate ? ` - ${format(phase.endDate, "MMM d, yyyy")}` : " - Present"}
              </span>
            </div>
            
            <div className="flex items-end gap-2">
              <p className="text-xl font-bold">{phase.dosageStrength}</p>
              <p className="text-sm text-muted-foreground mb-0.5">
                ({phase.dosageAmount} pill{phase.dosageAmount !== 1 ? "s" : ""})
              </p>
            </div>
          </div>
        ))}
        
        {phases.length === 0 && !isAdding && (
          <p className="text-sm text-center text-muted-foreground py-8">
            No dosage phases found.
          </p>
        )}
      </div>
    </div>
  );
}