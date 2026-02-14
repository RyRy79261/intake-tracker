"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import { COFFEE_PRESETS } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";
import {
  getCurrentDateTimeLocal,
  dateTimeLocalToTimestamp,
} from "@/lib/date-utils";
import { CollapsibleTimeInputControlled } from "@/components/collapsible-time-input";

interface CoffeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: number, source: string, timestamp?: number, note?: string) => Promise<void>;
  isSubmitting: boolean;
}

export function CoffeeDialog({ open, onOpenChange, onConfirm, isSubmitting }: CoffeeDialogProps) {
  const settings = useSettings();
  const [selectedType, setSelectedType] = useState(settings.coffeeDefaultType);
  const [otherName, setOtherName] = useState("");
  const [otherMl, setOtherMl] = useState("60");
  const [note, setNote] = useState("");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [customTime, setCustomTime] = useState(getCurrentDateTimeLocal());

  const selectedPreset = COFFEE_PRESETS.find((p) => p.value === selectedType);
  const isOther = selectedType === "other";
  const waterMl = isOther ? parseInt(otherMl, 10) || 0 : (selectedPreset?.waterMl ?? 0);

  const handleOpen = (newOpen: boolean) => {
    if (newOpen) {
      setSelectedType(settings.coffeeDefaultType);
      setOtherName("");
      setOtherMl("60");
      setNote("");
      setShowTimeInput(false);
      setCustomTime(getCurrentDateTimeLocal());
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    if (waterMl <= 0) return;
    const source = isOther
      ? `coffee:${otherName.trim() || "other"}`
      : `coffee:${selectedType}`;
    const timestamp = showTimeInput ? dateTimeLocalToTimestamp(customTime) : undefined;
    const finalNote = note.trim() || undefined;
    await onConfirm(waterMl, source, timestamp, finalNote);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5" />
            Log Coffee
          </DialogTitle>
          <DialogDescription>
            Select the type of coffee you had
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Coffee Type Selector */}
          <div className="space-y-2">
            <Label className="text-xs">Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {COFFEE_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "transition-all",
                    selectedType === preset.value &&
                      "bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700"
                  )}
                  onClick={() => setSelectedType(preset.value)}
                >
                  {preset.label}
                  {preset.waterMl > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({preset.waterMl}ml)
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Other fields */}
          {isOther && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="coffee-other-name">Coffee name</Label>
                <Input
                  id="coffee-other-name"
                  placeholder="e.g. Latte, Cappuccino"
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coffee-other-ml">Water content (ml)</Label>
                <Input
                  id="coffee-other-ml"
                  type="number"
                  min="1"
                  max="1000"
                  value={otherMl}
                  onChange={(e) => setOtherMl(e.target.value)}
                  className="text-center"
                />
              </div>
            </div>
          )}

          {/* Summary */}
          {waterMl > 0 && (
            <div className="text-center py-2 px-4 bg-sky-50 dark:bg-sky-950/30 rounded-lg">
              <span className="text-sm text-muted-foreground">Water content: </span>
              <span className="font-semibold text-sky-700 dark:text-sky-300">{waterMl} ml</span>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="coffee-note">Note (optional)</Label>
            <Textarea
              id="coffee-note"
              placeholder="e.g. with milk, decaf"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          {/* Time */}
          <CollapsibleTimeInputControlled
            value={customTime}
            onChange={setCustomTime}
            expanded={showTimeInput}
            onToggle={() => setShowTimeInput(!showTimeInput)}
            id="coffee-time"
          />

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || waterMl <= 0}
            className="w-full bg-sky-600 hover:bg-sky-700"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Coffee className="w-4 h-4 mr-2" />
                Log Coffee ({waterMl} ml)
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
