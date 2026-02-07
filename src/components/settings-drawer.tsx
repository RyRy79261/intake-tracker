"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Download,
  Upload,
  Trash2,
  Key,
  Droplets,
  Sparkles,
  RotateCcw,
  LogIn,
  LogOut,
  CheckCircle2,
  Plus,
  Minus,
  RefreshCw,
  Loader2,
  Smartphone,
  Lock,
  LockOpen,
  Shield,
  Sun,
  Moon,
  Monitor,
  User,
  Bell,
  Mic,
  ShieldCheck,
  X,
  Clock,
  Cloud,
  HardDrive,
  CloudUpload,
  CloudDownload,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSettings, usePerplexityKey } from "@/hooks/use-settings";
import { DebugPanel } from "./debug-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clearAllData } from "@/lib/intake-service";
import { downloadBackup, importBackup } from "@/lib/backup-service";
import { exportToServer, importFromServer, getStorageCounts } from "@/lib/storage-migration";
import * as serverStorage from "@/lib/server-storage";
import { useToast } from "@/hooks/use-toast";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { usePinGate, usePinProtected } from "@/hooks/use-pin-gate";
import { usePermissions, type PermissionState } from "@/hooks/use-permissions";
import { sendTestNotification, getNotificationSettings, saveNotificationSettings } from "@/lib/push-notification-service";

// Helper component for permission status badge
function PermissionBadge({
  state,
  onRequest,
  onReset,
}: {
  state: PermissionState;
  onRequest: () => void;
  onReset?: () => void;
}) {
  if (state === "granted") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Enabled
      </span>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <X className="w-3.5 h-3.5" />
          Blocked
        </span>
        {onReset && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReset}>
            Reset
          </Button>
        )}
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <span className="text-xs text-muted-foreground">
        Not available
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onRequest}>
      Enable
    </Button>
  );
}

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

// Generate hour options for day start selector
function formatHour(hour: number): string {
  if (hour === 0) return "12:00 AM (midnight)";
  if (hour === 12) return "12:00 PM (noon)";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const { hasKey, setApiKey } = usePerplexityKey();
  const { authenticated, login, logout, user, getAccessToken } = usePrivy();
  const { theme, setTheme } = useTheme();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const { isUpdateAvailable, applyUpdate, checkForUpdates, isUpdating } = useServiceWorker();
  
  // Storage mode
  const [isExportingToServer, setIsExportingToServer] = useState(false);
  const [isImportingFromServer, setIsImportingFromServer] = useState(false);
  const [storageCounts, setStorageCounts] = useState<{
    local: { intake: number; weight: number; bloodPressure: number };
    server: { intake: number; weight: number; bloodPressure: number } | null;
  } | null>(null);
  
  // PIN protection
  const { requirePin } = usePinProtected();
  const { 
    hasPinEnabled, 
    openSetupDialog, 
    openChangeDialog, 
    openRemoveDialog,
    lockNow,
  } = usePinGate();
  
  // Permissions
  const { permissions, requestNotifications, requestMicrophone, resetMicrophonePermission } = usePermissions();
  const [expiryNotificationsEnabled, setExpiryNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return getNotificationSettings().enabled;
  });

  // Local state for numeric inputs - allows free typing, validates on blur
  const [waterIncrementInput, setWaterIncrementInput] = useState(settings.waterIncrement.toString());
  const [waterLimitInput, setWaterLimitInput] = useState(settings.waterLimit.toString());
  const [saltIncrementInput, setSaltIncrementInput] = useState(settings.saltIncrement.toString());
  const [saltLimitInput, setSaltLimitInput] = useState(settings.saltLimit.toString());

  // Sync local state when settings change externally
  useEffect(() => {
    setWaterIncrementInput(settings.waterIncrement.toString());
    setWaterLimitInput(settings.waterLimit.toString());
    setSaltIncrementInput(settings.saltIncrement.toString());
    setSaltLimitInput(settings.saltLimit.toString());
  }, [settings.waterIncrement, settings.waterLimit, settings.saltIncrement, settings.saltLimit]);

  // Load syncable settings from server when drawer opens in server mode
  useEffect(() => {
    if (!open || settings.storageMode !== "server" || !authenticated) return;
    getAccessToken().then((token) => {
      if (token) {
        settings.loadSyncableFromServer({ Authorization: `Bearer ${token}` });
      }
    });
  }, [open, settings.storageMode, authenticated]);

  // Persist syncable settings to server when they change in server mode
  useEffect(() => {
    if (settings.storageMode !== "server" || !authenticated) return;
    const timeout = setTimeout(() => {
      getAccessToken().then((token) => {
        if (token) {
          settings.saveSyncableToServer({ Authorization: `Bearer ${token}` }).catch((err) => {
            console.error("Failed to save settings to server:", err);
          });
        }
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    settings.storageMode,
    authenticated,
    settings.waterLimit,
    settings.saltLimit,
    settings.waterIncrement,
    settings.saltIncrement,
    settings.dayStartHour,
    settings.dataRetentionDays,
  ]);

  // Handle open change with PIN protection
  const handleOpenChange = useCallback(async (newOpen: boolean) => {
    if (newOpen) {
      const unlocked = await requirePin();
      if (unlocked) {
        onOpenChange(true);
      }
    } else {
      onOpenChange(false);
    }
  }, [requirePin, onOpenChange]);

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
      await downloadBackup();
      toast({
        title: "Export successful",
        description: "Your data has been downloaded",
        variant: "success",
      });
    } catch {
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
      const result = await importBackup(file, "merge");
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["intake"] });
        queryClient.invalidateQueries({ queryKey: ["health"] });
        const total = result.intakeImported + result.weightImported + result.bpImported;
        toast({
          title: "Import successful",
          description: `Imported ${total} records (${result.skipped} skipped)`,
          variant: "success",
        });
      } else {
        throw new Error(result.errors.join(", ") || "Import failed");
      }
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
      // Invalidate queries to refresh UI with cleared data
      queryClient.invalidateQueries({ queryKey: ["intake"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      toast({
        title: "Data cleared",
        description: "All intake records have been deleted",
        variant: "success",
      });
      setShowClearConfirm(false);
    } catch {
      toast({
        title: "Error",
        description: "Could not clear data",
        variant: "destructive",
      });
    }
  };

  const handleResetToDefaults = () => {
    settings.resetToDefaults();
    setWaterIncrementInput("250");
    setWaterLimitInput("1000");
    setSaltIncrementInput("250");
    setSaltLimitInput("1500");
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults",
    });
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="right">
      <DrawerContent direction="right" className="h-full flex flex-col">
        {/* Fixed Header */}
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>
            Configure your intake tracker preferences
          </DrawerDescription>
        </DrawerHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Account Section - shows when authenticated */}
            {authenticated && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <User className="w-4 h-4" />
                  <h3 className="font-semibold">Account</h3>
                </div>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                    <p className="text-sm font-medium">{user?.email?.address || "Authenticated user"}</p>
                    <p className="text-xs text-muted-foreground">Signed in</p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={logout}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            )}

            {/* Day Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Clock className="w-4 h-4" />
                <h3 className="font-semibold">Day Settings</h3>
              </div>
              <div className="space-y-3 pl-6">
                <div className="space-y-2">
                  <Label htmlFor="day-start">Day Start Time</Label>
                  <Select 
                    value={settings.dayStartHour.toString()} 
                    onValueChange={(value) => settings.setDayStartHour(parseInt(value, 10))}
                  >
                    <SelectTrigger id="day-start" className="w-full">
                      <SelectValue placeholder="Select day start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {formatHour(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    When your &quot;day&quot; starts for budget tracking. Useful if you stay up past midnight.
                  </p>
                </div>
              </div>
            </div>

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
                    Your daily water intake target (100-10000)
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
                    Your daily salt intake limit (100-10000)
                  </p>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Sun className="w-4 h-4" />
                <h3 className="font-semibold">Appearance</h3>
              </div>
              <div className="space-y-3 pl-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger id="theme" className="w-full">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="w-4 h-4" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose light, dark, or follow your system preference
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

            {/* Storage Mode */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
                <Cloud className="w-4 h-4" />
                <h3 className="font-semibold">Storage</h3>
              </div>
              <div className="space-y-3">
                {/* Storage Mode Toggle */}
                <div className="space-y-2">
                  <Label>Storage Location</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={settings.storageMode === "local" ? "default" : "outline"}
                      className="justify-start gap-2"
                      onClick={() => settings.setStorageMode("local")}
                    >
                      <HardDrive className="w-4 h-4" />
                      Local
                    </Button>
                    <Button
                      variant={settings.storageMode === "server" ? "default" : "outline"}
                      className="justify-start gap-2"
                      onClick={() => {
                        if (!authenticated) {
                          toast({
                            title: "Authentication required",
                            description: "Please sign in to use server storage",
                            variant: "destructive",
                          });
                          return;
                        }
                        settings.setStorageMode("server");
                      }}
                      disabled={!authenticated}
                    >
                      <Cloud className="w-4 h-4" />
                      Server
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {settings.storageMode === "local" 
                      ? "Data stored on this device only. Works offline."
                      : "Data stored on server. Access from any device."}
                  </p>
                </div>

                {/* Data Migration */}
                {authenticated && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label>Data Migration</Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={async () => {
                        const token = await getAccessToken();
                        if (!token) {
                          toast({
                            title: "Not authenticated",
                            description: "Please sign in to view storage counts",
                            variant: "destructive",
                          });
                          return;
                        }
                        try {
                          const counts = await getStorageCounts({ Authorization: `Bearer ${token}` });
                          setStorageCounts(counts);
                          const localTotal = counts.local.intake + counts.local.weight + counts.local.bloodPressure;
                          const serverTotal = counts.server 
                            ? counts.server.intake + counts.server.weight + counts.server.bloodPressure 
                            : 0;
                          toast({
                            title: "Storage counts",
                            description: `Local: ${localTotal} records • Server: ${serverTotal} records`,
                          });
                        } catch (error) {
                          toast({
                            title: "Failed to get counts",
                            description: error instanceof Error ? error.message : "Unknown error",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Check Storage Counts
                    </Button>
                    
                    {storageCounts && (
                      <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span>Local records:</span>
                          <span className="font-medium">
                            {storageCounts.local.intake + storageCounts.local.weight + storageCounts.local.bloodPressure}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Server records:</span>
                          <span className="font-medium">
                            {storageCounts.server 
                              ? storageCounts.server.intake + storageCounts.server.weight + storageCounts.server.bloodPressure
                              : "—"}
                          </span>
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={async () => {
                        const token = await getAccessToken();
                        if (!token) {
                          toast({
                            title: "Not authenticated",
                            description: "Please sign in to export data",
                            variant: "destructive",
                          });
                          return;
                        }
                        setIsExportingToServer(true);
                        try {
                          const authHeaders = { Authorization: `Bearer ${token}` };
                          const result = await exportToServer(authHeaders);
                          if (result.success) {
                            await settings.saveSyncableToServer(authHeaders);
                            // Invalidate queries since local storage was cleared
                            queryClient.invalidateQueries({ queryKey: ["intake"] });
                            queryClient.invalidateQueries({ queryKey: ["health"] });
                            toast({
                              title: "Export successful",
                              description: `Exported ${result.imported} records to server (${result.skipped} skipped)`,
                              variant: "success",
                            });
                          } else {
                            throw new Error(result.error);
                          }
                        } catch (error) {
                          toast({
                            title: "Export failed",
                            description: error instanceof Error ? error.message : "Unknown error",
                            variant: "destructive",
                          });
                        } finally {
                          setIsExportingToServer(false);
                        }
                      }}
                      disabled={isExportingToServer}
                    >
                      {isExportingToServer ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CloudUpload className="w-4 h-4" />
                      )}
                      {isExportingToServer ? "Exporting..." : "Export Local to Server"}
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={async () => {
                        const token = await getAccessToken();
                        if (!token) {
                          toast({
                            title: "Not authenticated",
                            description: "Please sign in to import data",
                            variant: "destructive",
                          });
                          return;
                        }
                        setIsImportingFromServer(true);
                        try {
                          const authHeaders = { Authorization: `Bearer ${token}` };
                          const serverSettings = await serverStorage.getSettings(authHeaders);
                          const result = await importFromServer(authHeaders, "merge");
                          if (result.success) {
                            if (serverSettings) {
                              settings.setSyncableFromServer(serverSettings);
                            }
                            queryClient.invalidateQueries({ queryKey: ["intake"] });
                            queryClient.invalidateQueries({ queryKey: ["health"] });
                            toast({
                              title: "Import successful",
                              description: `Imported ${result.imported} records from server (${result.skipped} skipped)`,
                              variant: "success",
                            });
                          } else {
                            throw new Error(result.error);
                          }
                        } catch (error) {
                          toast({
                            title: "Import failed",
                            description: error instanceof Error ? error.message : "Unknown error",
                            variant: "destructive",
                          });
                        } finally {
                          setIsImportingFromServer(false);
                        }
                      }}
                      disabled={isImportingFromServer}
                    >
                      {isImportingFromServer ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CloudDownload className="w-4 h-4" />
                      )}
                      {isImportingFromServer ? "Importing..." : "Import Server to Local"}
                    </Button>

                    <p className="text-xs text-muted-foreground">
                      Migrate data between local device and server. Source storage is cleared after successful migration.
                    </p>
                  </div>
                )}

                {!authenticated && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">
                      Sign in to enable server storage and data migration.
                    </p>
                  </div>
                )}
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
                  {isExporting ? "Exporting..." : "Export to File"}
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
                  {isImporting ? "Importing..." : "Import from File"}
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

            {/* Privacy & Security */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Shield className="w-4 h-4" />
                <h3 className="font-semibold">Privacy & Security</h3>
              </div>
              <div className="space-y-3 pl-0">
                {hasPinEnabled ? (
                  <>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <Lock className="w-4 h-4" />
                        <span className="text-sm font-medium">PIN Protection Enabled</span>
                      </div>
                      <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                        History and settings are protected
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={openChangeDialog}
                    >
                      <Key className="w-4 h-4" />
                      Change PIN
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={lockNow}
                    >
                      <Lock className="w-4 h-4" />
                      Lock Now
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={openRemoveDialog}
                    >
                      <LockOpen className="w-4 h-4" />
                      Remove PIN
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={openSetupDialog}
                    >
                      <Lock className="w-4 h-4" />
                      Set Up PIN
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Protect history and settings with a 4-digit PIN.
                      You&apos;ll only need to enter it once per day.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <ShieldCheck className="w-4 h-4" />
                <h3 className="font-semibold">Permissions</h3>
              </div>
              <div className="space-y-3">
                {/* Notifications Permission */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Notifications</p>
                      <p className="text-xs text-muted-foreground">For expiry reminders</p>
                    </div>
                  </div>
                  <PermissionBadge
                    state={permissions.notifications}
                    onRequest={async () => {
                      const granted = await requestNotifications();
                      if (granted) {
                        toast({ title: "Notifications enabled", variant: "success" });
                      }
                    }}
                  />
                </div>

                {/* Microphone Permission */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Mic className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Microphone</p>
                      <p className="text-xs text-muted-foreground">For voice input</p>
                    </div>
                  </div>
                  <PermissionBadge
                    state={permissions.microphone}
                    onRequest={async () => {
                      const granted = await requestMicrophone();
                      if (granted) {
                        toast({ title: "Microphone enabled", variant: "success" });
                      }
                    }}
                    onReset={() => {
                      resetMicrophonePermission();
                      toast({ title: "Permission reset", description: "Tap Enable to request microphone access again" });
                    }}
                  />
                </div>

                {/* Expiry Notifications Toggle - only show if notifications are granted */}
                {permissions.notifications === "granted" && (
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">Expiry Reminders</p>
                      <p className="text-xs text-muted-foreground">
                        Get notified when records are about to expire
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={expiryNotificationsEnabled ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const newValue = !expiryNotificationsEnabled;
                          setExpiryNotificationsEnabled(newValue);
                          saveNotificationSettings({ enabled: newValue });
                          toast({
                            title: newValue ? "Reminders enabled" : "Reminders disabled",
                            variant: "success",
                          });
                        }}
                      >
                        {expiryNotificationsEnabled ? "On" : "Off"}
                      </Button>
                      {expiryNotificationsEnabled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const sent = await sendTestNotification();
                            if (sent) {
                              toast({ title: "Test notification sent", variant: "success" });
                            } else {
                              toast({ title: "Failed to send notification", variant: "destructive" });
                            }
                          }}
                        >
                          Test
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* App Updates */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Smartphone className="w-4 h-4" />
                <h3 className="font-semibold">App Updates</h3>
              </div>
              <div className="space-y-3 pl-0">
                {isUpdateAvailable ? (
                  <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
                          Update available
                        </p>
                        <p className="text-xs text-sky-600 dark:text-sky-500 mt-0.5">
                          A new version is ready to install
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-sky-600 hover:bg-sky-700"
                        onClick={applyUpdate}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Update
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={async () => {
                      setIsCheckingUpdates(true);
                      try {
                        const hasUpdate = await checkForUpdates();
                        if (hasUpdate) {
                          toast({
                            title: "Update available",
                            description: "A new version is ready to install",
                          });
                        } else {
                          toast({
                            title: "You're up to date",
                            description: "You have the latest version",
                          });
                        }
                      } catch {
                        toast({
                          title: "Check failed",
                          description: "Could not check for updates",
                          variant: "destructive",
                        });
                      } finally {
                        setIsCheckingUpdates(false);
                      }
                    }}
                    disabled={isCheckingUpdates}
                  >
                    {isCheckingUpdates ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Check for Updates
                      </>
                    )}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Installed as PWA • Updates are checked automatically
                </p>
              </div>
            </div>

            {/* Debug Panel */}
            <div className="pt-4 border-t">
              <DebugPanel />
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <DrawerFooter className="border-t shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={handleResetToDefaults}
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
