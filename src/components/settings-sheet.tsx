"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Download,
  Upload,
  Trash2,
  Key,
  Droplets,
  Sparkles,
  RotateCcw,
  LogIn,
  CheckCircle2,
  Plus,
  Minus,
} from "lucide-react";
import { useSettings, usePerplexityKey } from "@/hooks/use-settings";
import { exportAllData, importData, clearAllData } from "@/lib/intake-service";
import { useToast } from "@/hooks/use-toast";

// Helper component for numeric input with increment/decrement buttons
function NumericInput({
  id,
  value,
  onChange,
  onBlur,
  min,
  max,
  step,
  onIncrement,
  onDecrement,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  min: number;
  max: number;
  step: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={onDecrement}
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="text-center"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={onIncrement}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function SettingsSheet() {
  const settings = useSettings();
  const { hasKey, setApiKey } = usePerplexityKey();
  const { authenticated, login, user } = usePrivy();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Local state for numeric inputs - allows free typing, validates on blur
  const [waterIncrementInput, setWaterIncrementInput] = useState(settings.waterIncrement.toString());
  const [waterLimitInput, setWaterLimitInput] = useState(settings.waterLimit.toString());
  const [saltIncrementInput, setSaltIncrementInput] = useState(settings.saltIncrement.toString());
  const [saltLimitInput, setSaltLimitInput] = useState(settings.saltLimit.toString());

  // Sync local state when sheet opens or settings change externally
  useEffect(() => {
    if (isOpen) {
      setWaterIncrementInput(settings.waterIncrement.toString());
      setWaterLimitInput(settings.waterLimit.toString());
      setSaltIncrementInput(settings.saltIncrement.toString());
      setSaltLimitInput(settings.saltLimit.toString());
    }
  }, [isOpen, settings.waterIncrement, settings.waterLimit, settings.saltIncrement, settings.saltLimit]);

  // Validation helpers
  const validateAndSave = (
    inputValue: string,
    min: number,
    max: number,
    defaultValue: number,
    setter: (value: number) => void,
    inputSetter: (value: string) => void
  ) => {
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      setter(parsed);
      inputSetter(parsed.toString());
    } else {
      // Reset to current valid value
      inputSetter(defaultValue.toString());
    }
  };

  const handleIncrement = (
    currentValue: number,
    step: number,
    max: number,
    setter: (value: number) => void,
    inputSetter: (value: string) => void
  ) => {
    const newValue = Math.min(currentValue + step, max);
    setter(newValue);
    inputSetter(newValue.toString());
  };

  const handleDecrement = (
    currentValue: number,
    step: number,
    min: number,
    setter: (value: number) => void,
    inputSetter: (value: string) => void
  ) => {
    const newValue = Math.max(currentValue - step, min);
    setter(newValue);
    inputSetter(newValue.toString());
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportAllData();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intake-tracker-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Export successful",
        description: "Your data has been downloaded",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Could not export data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const result = await importData(text, "merge");
      toast({
        title: "Import successful",
        description: `Imported ${result.imported} records (${result.skipped} skipped)`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description:
          error instanceof Error ? error.message : "Could not import data",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClearData = async () => {
    try {
      await clearAllData();
      toast({
        title: "Data cleared",
        description: "All intake records have been deleted",
        variant: "success",
      });
      setShowClearConfirm(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not clear data",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0">
          <Settings className="w-5 h-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure your intake tracker preferences
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Water Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Droplets className="w-4 h-4" />
              <h3 className="font-semibold">Water Settings</h3>
            </div>
            <div className="space-y-3 pl-6">
              <div className="space-y-2">
                <Label htmlFor="water-increment">Increment (ml)</Label>
                <NumericInput
                  id="water-increment"
                  value={waterIncrementInput}
                  onChange={setWaterIncrementInput}
                  onBlur={() => validateAndSave(
                    waterIncrementInput,
                    10,
                    1000,
                    settings.waterIncrement,
                    settings.setWaterIncrement,
                    setWaterIncrementInput
                  )}
                  min={10}
                  max={1000}
                  step={10}
                  onIncrement={() => handleIncrement(
                    settings.waterIncrement,
                    10,
                    1000,
                    settings.setWaterIncrement,
                    setWaterIncrementInput
                  )}
                  onDecrement={() => handleDecrement(
                    settings.waterIncrement,
                    10,
                    10,
                    settings.setWaterIncrement,
                    setWaterIncrementInput
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Amount added with each +/- tap (10-1000)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="water-limit">Daily Limit (ml)</Label>
                <NumericInput
                  id="water-limit"
                  value={waterLimitInput}
                  onChange={setWaterLimitInput}
                  onBlur={() => validateAndSave(
                    waterLimitInput,
                    100,
                    10000,
                    settings.waterLimit,
                    settings.setWaterLimit,
                    setWaterLimitInput
                  )}
                  min={100}
                  max={10000}
                  step={100}
                  onIncrement={() => handleIncrement(
                    settings.waterLimit,
                    100,
                    10000,
                    settings.setWaterLimit,
                    setWaterLimitInput
                  )}
                  onDecrement={() => handleDecrement(
                    settings.waterLimit,
                    100,
                    100,
                    settings.setWaterLimit,
                    setWaterLimitInput
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Your 24-hour water intake target (100-10000)
                </p>
              </div>
            </div>
          </div>

          {/* Salt Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
              <h3 className="font-semibold">Salt Settings</h3>
            </div>
            <div className="space-y-3 pl-6">
              <div className="space-y-2">
                <Label htmlFor="salt-increment">Increment (mg)</Label>
                <NumericInput
                  id="salt-increment"
                  value={saltIncrementInput}
                  onChange={setSaltIncrementInput}
                  onBlur={() => validateAndSave(
                    saltIncrementInput,
                    10,
                    1000,
                    settings.saltIncrement,
                    settings.setSaltIncrement,
                    setSaltIncrementInput
                  )}
                  min={10}
                  max={1000}
                  step={10}
                  onIncrement={() => handleIncrement(
                    settings.saltIncrement,
                    10,
                    1000,
                    settings.setSaltIncrement,
                    setSaltIncrementInput
                  )}
                  onDecrement={() => handleDecrement(
                    settings.saltIncrement,
                    10,
                    10,
                    settings.setSaltIncrement,
                    setSaltIncrementInput
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Amount added with each +/- tap (10-1000)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="salt-limit">Daily Limit (mg)</Label>
                <NumericInput
                  id="salt-limit"
                  value={saltLimitInput}
                  onChange={setSaltLimitInput}
                  onBlur={() => validateAndSave(
                    saltLimitInput,
                    100,
                    10000,
                    settings.saltLimit,
                    settings.setSaltLimit,
                    setSaltLimitInput
                  )}
                  min={100}
                  max={10000}
                  step={100}
                  onIncrement={() => handleIncrement(
                    settings.saltLimit,
                    100,
                    10000,
                    settings.setSaltLimit,
                    setSaltLimitInput
                  )}
                  onDecrement={() => handleDecrement(
                    settings.saltLimit,
                    100,
                    100,
                    settings.setSaltLimit,
                    setSaltLimitInput
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Your 24-hour salt intake limit (100-10000)
                </p>
              </div>
            </div>
          </div>

          {/* AI Integration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
              <Key className="w-4 h-4" />
              <h3 className="font-semibold">AI Integration</h3>
            </div>
            
            {/* Authentication Status */}
            <div className="space-y-2 pl-6">
              <Label>Authentication (Recommended)</Label>
              {authenticated ? (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Signed in</span>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    {user?.email?.address || "Authenticated user"} — AI features enabled
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={login}
                  >
                    <LogIn className="w-4 h-4" />
                    Sign in to enable AI
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Sign in with your authorized account to use AI features with the server API key.
                  </p>
                </div>
              )}
            </div>

            <div className="pl-6 py-2">
              <p className="text-xs text-muted-foreground text-center">— or use your own key —</p>
            </div>

            {/* Client API Key - fallback */}
            <div className="space-y-2 pl-6">
              <Label htmlFor="api-key">Your Own API Key (Fallback)</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={hasKey ? "••••••••••••" : "pplx-..."}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (apiKeyInput) {
                      setApiKey(apiKeyInput);
                      setApiKeyInput("");
                      toast({ title: "API key saved", variant: "success" });
                    }
                  }}
                  disabled={!apiKeyInput}
                >
                  Save
                </Button>
              </div>
              {hasKey && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Your API key configured
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                If not signing in, enter your own Perplexity API key.{" "}
                <a
                  href="https://www.perplexity.ai/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Get an API key
                </a>
              </p>
            </div>
          </div>

          {/* Data Management */}
          <div className="space-y-4">
            <h3 className="font-semibold">Data Management</h3>
            <div className="space-y-3 pl-0">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleExport}
                disabled={isExporting}
              >
                <Download className="w-4 h-4" />
                {isExporting ? "Exporting..." : "Export Data"}
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                <Upload className="w-4 h-4" />
                {isImporting ? "Importing..." : "Import Data"}
              </Button>

              {!showClearConfirm ? (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All Data
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowClearConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleClearData}
                  >
                    Confirm Delete
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Reset Settings */}
          <div className="pt-4 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => {
                settings.resetToDefaults();
                // Sync local inputs with reset values
                setWaterIncrementInput("250");
                setWaterLimitInput("1000");
                setSaltIncrementInput("250");
                setSaltLimitInput("1500");
                toast({
                  title: "Settings reset",
                  description: "All settings have been restored to defaults",
                });
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
