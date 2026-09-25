"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { RotateCcw } from "lucide-react";
import { Button } from "@intake/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@intake/ui/alert-dialog";
import { useToast } from "@intake/ui/use-toast";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * "Reset to Defaults" with a confirmation step. Resets the preferences in the
 * settings store (which keeps liquid presets, storage mode, dose reminders and
 * the seen-intro flag) and the theme, which next-themes owns.
 */
export function ResetSettingsButton() {
  const [open, setOpen] = useState(false);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const { setTheme } = useTheme();
  const { toast } = useToast();

  const handleConfirm = () => {
    resetToDefaults();
    setTheme("system");
    toast({
      title: "Settings reset",
      description:
        "Preferences were restored to defaults. Your presets, storage mode and reminders were kept.",
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="w-4 h-4" />
        Reset to Defaults
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset settings to defaults?</AlertDialogTitle>
          <AlertDialogDescription>
            Limits, increments, display and navigation preferences go back to
            their defaults. Your logged data, liquid presets, storage mode and
            dose reminders are not changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Reset</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
