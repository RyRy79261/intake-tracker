"use client";

import { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PillIcon } from "./pill-icon";
import { 
  usePhasesForPrescription, 
  useInventoryForPrescription, 
  useStartNewPhase,
  useUpdatePrescription,
  useDeletePrescription,
  useSchedulesForPhase,
  usePrescriptions
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { Loader2, Plus, Clock, Pill, Edit2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { useMedicineSearch } from "@/hooks/use-medicine-search";

interface PrescriptionViewDrawerProps {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrescriptionViewDrawer({ prescription, open, onOpenChange }: PrescriptionViewDrawerProps) {
  const { data: prescriptions = [] } = usePrescriptions();
  const currentPrescription = prescriptions.find(p => p.id === prescription?.id) || prescription;

  if (!currentPrescription) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{currentPrescription.genericName}</DrawerTitle>
          <p className="text-sm text-muted-foreground">{currentPrescription.indication}</p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details" className="w-full h-full flex flex-col">
            <div className="px-4 pt-4 shrink-0 border-b">
              <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-muted/50 rounded-lg mb-4">
                <TabsTrigger value="details" className="py-2 text-xs">Details</TabsTrigger>
                <TabsTrigger value="titration" className="py-2 text-xs">Phases</TabsTrigger>
                <TabsTrigger value="info" className="py-2 text-xs">Info</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="details" className="mt-0 space-y-6">
                <DetailsTab prescription={currentPrescription} onOpenChange={onOpenChange} />
              </TabsContent>

              <TabsContent value="titration" className="mt-0">
                <TitrationTab prescription={currentPrescription} />
              </TabsContent>

              <TabsContent value="info" className="mt-0">
                <InfoTab prescription={currentPrescription} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DetailsTab({ prescription, onOpenChange }: { prescription: Prescription, onOpenChange: (open: boolean) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(prescription.genericName);
  const [indication, setIndication] = useState(prescription.indication);
  const [notes, setNotes] = useState(prescription.notes || "");
  
  const updatePrescription = useUpdatePrescription();
  const deletePrescription = useDeletePrescription();

  // Reset form when prescription changes
  useEffect(() => {
    setName(prescription.genericName);
    setIndication(prescription.indication);
    setNotes(prescription.notes || "");
    setIsEditing(false);
  }, [prescription]);

  const handleSave = async () => {
    await updatePrescription.mutateAsync({
      id: prescription.id,
      updates: {
        genericName: name,
        indication,
        notes
      }
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to permanently delete this prescription and all its history? This action cannot be undone.")) {
      await deletePrescription.mutateAsync(prescription.id);
      onOpenChange(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Prescription Details</h3>
        {!isEditing ? (
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setIsEditing(true)}>
            <Edit2 className="w-3 h-3" /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-teal-600" onClick={handleSave} disabled={updatePrescription.isPending}>
              {updatePrescription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason for use</Label>
            <Input value={indication} onChange={(e) => setIndication(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              className="resize-none" 
              rows={3}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Reason for use</p>
            <p className="text-sm font-medium">{prescription.indication || "None specified"}</p>
          </div>
          
          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm bg-muted/30 p-3 rounded-lg border">
              {prescription.notes || "No notes added."}
            </p>
          </div>

          <div className="pt-4 border-t">
            <Button 
              variant="destructive" 
              className="w-full" 
              onClick={handleDelete}
              disabled={deletePrescription.isPending}
            >
              {deletePrescription.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Prescription"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTab({ prescription }: { prescription: Prescription }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updatePrescription = useUpdatePrescription();
  const searchMutation = useMedicineSearch();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await searchMutation.mutateAsync(prescription.genericName);
      if (result) {
        await updatePrescription.mutateAsync({
          id: prescription.id,
          updates: {
            contraindications: result.contraindications || [],
            warnings: result.warnings || []
          }
        });
      }
    } catch (e) {
      console.error("Failed to refresh AI data", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI Information</h3>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={handleRefresh} disabled={isRefreshing || updatePrescription.isPending}>
          {isRefreshing || updatePrescription.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          Refresh AI Data
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-red-500 dark:text-red-400">Contraindications</h3>
        {prescription.contraindications && prescription.contraindications.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground uppercase">
            {prescription.contraindications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No contraindications listed.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-amber-500 dark:text-amber-400">Warnings</h3>
        {prescription.warnings && prescription.warnings.length > 0 ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {prescription.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No warnings listed.
          </p>
        )}
      </div>
    </div>
  );
}

function TitrationTab({ prescription }: { prescription: Prescription }) {
  const { data: phases = [], isLoading } = usePhasesForPrescription(prescription.id);
  const startNewPhase = useStartNewPhase();
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [unit, setUnit] = useState("mg");
  const [type, setType] = useState<"maintenance" | "titration">("titration");
  const [schedules, setSchedules] = useState<{ time: string; dosage: number }[]>([
    { time: "08:00", dosage: 100 }
  ]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleStartPhase = async () => {
    if (schedules.length === 0) return;

    await startNewPhase.mutateAsync({
      prescriptionId: prescription.id,
      type,
      unit,
      startDate: Date.now(),
      foodInstruction: "none",
      schedules: schedules.map(s => ({ ...s, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }))
    });
    
    setIsAdding(false);
  };

  const addSchedule = () => setSchedules([...schedules, { time: "20:00", dosage: 100 }]);
  const updateSchedule = (i: number, updates: Partial<{ time: string; dosage: number }>) => {
    const next = [...schedules];
    next[i] = { ...next[i], ...updates };
    setSchedules(next);
  };
  const removeSchedule = (i: number) => {
    setSchedules(schedules.filter((_, idx) => idx !== i));
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
              <Label className="text-xs">Unit (e.g. mg, ml)</Label>
              <Input 
                value={unit} 
                onChange={(e) => setUnit(e.target.value)} 
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs">Daily Schedule</Label>
            {schedules.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input 
                  type="time" 
                  value={s.time} 
                  onChange={(e) => updateSchedule(i, { time: e.target.value })} 
                  className="h-9"
                />
                <Input 
                  type="number" 
                  value={s.dosage} 
                  onChange={(e) => updateSchedule(i, { dosage: parseFloat(e.target.value) || 0 })} 
                  className="h-9"
                  placeholder="Dosage"
                />
                {schedules.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeSchedule(i)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full gap-2 text-xs h-8 mt-1" onClick={addSchedule}>
              <Plus className="w-3 h-3" /> Add Time
            </Button>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button 
              size="sm" 
              className="bg-teal-600 hover:bg-teal-700" 
              onClick={handleStartPhase}
              disabled={startNewPhase.isPending || schedules.length === 0}
            >
              {startNewPhase.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Start Phase"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {phases.map((phase) => (
          <PhaseCard key={phase.id} phase={phase} />
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

function PhaseCard({ phase }: { phase: any }) {
  const { data: schedules = [] } = useSchedulesForPhase(phase.id);
  const totalDaily = schedules.reduce((acc, s) => acc + s.dosage, 0);

  return (
    <div 
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
      
      <div className="flex flex-col gap-1 mt-3">
        <p className="text-xl font-bold">
          {totalDaily} <span className="text-sm font-normal text-muted-foreground">{phase.unit}/day</span>
        </p>
        {schedules.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
            {schedules.map(s => (
              <p key={s.id}>• {s.time} - {s.dosage} {phase.unit}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}