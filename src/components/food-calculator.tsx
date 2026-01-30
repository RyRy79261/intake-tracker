"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Apple, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatAmount } from "@/lib/utils";

interface FoodCalculatorProps {
  onAddWater: (amount: number, source: string) => Promise<void>;
}

// Common foods with their water content percentages
const FOOD_PRESETS = [
  { name: "Apple", waterPercent: 86 },
  { name: "Banana", waterPercent: 75 },
  { name: "Orange", waterPercent: 87 },
  { name: "Watermelon", waterPercent: 92 },
  { name: "Grapes", waterPercent: 81 },
  { name: "Strawberries", waterPercent: 91 },
  { name: "Cucumber", waterPercent: 96 },
  { name: "Tomato", waterPercent: 94 },
  { name: "Lettuce", waterPercent: 96 },
  { name: "Celery", waterPercent: 95 },
  { name: "Carrot", waterPercent: 88 },
  { name: "Broccoli", waterPercent: 89 },
  { name: "Spinach", waterPercent: 91 },
  { name: "Peach", waterPercent: 89 },
  { name: "Pineapple", waterPercent: 86 },
  { name: "Milk", waterPercent: 87 },
  { name: "Yogurt", waterPercent: 85 },
  { name: "Soup (broth)", waterPercent: 92 },
  { name: "Rice (cooked)", waterPercent: 70 },
  { name: "Pasta (cooked)", waterPercent: 62 },
  { name: "Custom", waterPercent: 80 },
];

export function FoodCalculator({ onAddWater }: FoodCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<string>("");
  const [weightGrams, setWeightGrams] = useState<string>("");
  const [customPercent, setCustomPercent] = useState<string>("80");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const selectedPreset = FOOD_PRESETS.find((f) => f.name === selectedFood);
  const waterPercent =
    selectedFood === "Custom"
      ? parseInt(customPercent, 10) || 0
      : selectedPreset?.waterPercent || 0;

  const calculatedWater = useMemo(() => {
    const weight = parseInt(weightGrams, 10) || 0;
    return Math.round((weight * waterPercent) / 100);
  }, [weightGrams, waterPercent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (calculatedWater <= 0) return;

    setIsSubmitting(true);
    try {
      const source = `food:${selectedFood.toLowerCase()}`;
      await onAddWater(calculatedWater, source);
      toast({
        title: `Added ${formatAmount(calculatedWater, "ml")} from ${selectedFood}`,
        description: `${weightGrams}g at ${waterPercent}% water content`,
        variant: "success",
      });
      setOpen(false);
      // Reset form
      setSelectedFood("");
      setWeightGrams("");
      setCustomPercent("80");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add water intake",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex-1 h-12 gap-2 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-green-200 dark:from-green-950/30 dark:to-emerald-950/30 dark:hover:from-green-900/40 dark:hover:to-emerald-900/40 dark:border-green-800"
        >
          <Apple className="w-5 h-5 text-green-600 dark:text-green-400" />
          <span>Add from Food</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Food Water Calculator
          </DialogTitle>
          <DialogDescription>
            Calculate water content from foods to add to your daily intake.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Food Selection */}
          <div className="space-y-2">
            <Label htmlFor="food">Food Type</Label>
            <Select value={selectedFood} onValueChange={setSelectedFood}>
              <SelectTrigger id="food">
                <SelectValue placeholder="Select a food..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {FOOD_PRESETS.map((food) => (
                  <SelectItem key={food.name} value={food.name}>
                    {food.name}{" "}
                    {food.name !== "Custom" && (
                      <span className="text-muted-foreground">
                        ({food.waterPercent}%)
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Weight Input */}
          <div className="space-y-2">
            <Label htmlFor="weight">Weight (grams)</Label>
            <Input
              id="weight"
              type="number"
              min="1"
              step="1"
              value={weightGrams}
              onChange={(e) => setWeightGrams(e.target.value)}
              placeholder="Enter weight in grams"
              className="h-12"
            />
          </div>

          {/* Custom Percentage (only shown when Custom is selected) */}
          {selectedFood === "Custom" && (
            <div className="space-y-2">
              <Label htmlFor="percent">Water Percentage (%)</Label>
              <Input
                id="percent"
                type="number"
                min="1"
                max="100"
                step="1"
                value={customPercent}
                onChange={(e) => setCustomPercent(e.target.value)}
                placeholder="Enter water percentage"
                className="h-12"
              />
            </div>
          )}

          {/* Calculation Preview */}
          {selectedFood && weightGrams && (
            <div className="p-4 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Calculated water content:
                </p>
                <p className="text-3xl font-bold text-sky-600 dark:text-sky-400">
                  {formatAmount(calculatedWater, "ml")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {weightGrams}g × {waterPercent}%
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || calculatedWater <= 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? "Adding..." : "Add Water"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
