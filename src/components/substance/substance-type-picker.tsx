"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Loader2, Sparkles, Edit3 } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useAuth } from "@/components/auth-guard";
import { isOffline } from "@/lib/ai-client";

export interface SubstanceTypeSelection {
  name: string;
  amountMg?: number;
  amountStandardDrinks?: number;
  volumeMl: number;
  description: string;
}

interface SubstanceTypePickerProps {
  type: "caffeine" | "alcohol";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: SubstanceTypeSelection) => void;
}

type PickerStep = "select" | "other-input" | "other-result";

interface AiResult {
  caffeineMg?: number;
  standardDrinks?: number;
  volumeMl?: number;
  reasoning?: string;
}

export function SubstanceTypePicker({
  type,
  open,
  onOpenChange,
  onSelect,
}: SubstanceTypePickerProps) {
  const substanceConfig = useSettingsStore((s) => s.substanceConfig);
  const { getAuthHeader } = useAuth();

  const [step, setStep] = useState<PickerStep>("select");
  const [customDescription, setCustomDescription] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);
  // Why we're showing default values instead of an AI result. Lets the
  // banner explain "you're offline" vs. "the AI failed" rather than a
  // single generic message.
  const [fallbackReason, setFallbackReason] = useState<"offline" | "error" | null>(null);

  // Manual override fields
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideVolume, setOverrideVolume] = useState("");

  const resetState = () => {
    setStep("select");
    setCustomDescription("");
    setIsEnriching(false);
    setAiResult(null);
    setReasoning(null);
    setFallbackReason(null);
    setOverrideAmount("");
    setOverrideVolume("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleSelectType = (typeName: string) => {
    if (typeName === "Other") {
      setStep("other-input");
      return;
    }

    if (type === "caffeine") {
      const caffeineTypes = substanceConfig.caffeine.types;
      const found = caffeineTypes.find((t) => t.name === typeName);
      if (found) {
        onSelect({
          name: found.name,
          amountMg: found.defaultMg,
          volumeMl: found.defaultVolumeMl,
          description: found.name,
        });
        handleOpenChange(false);
      }
    } else {
      const alcoholTypes = substanceConfig.alcohol.types;
      const found = alcoholTypes.find((t) => t.name === typeName);
      if (found) {
        onSelect({
          name: found.name,
          amountStandardDrinks: found.defaultDrinks,
          volumeMl: found.defaultVolumeMl,
          description: found.name,
        });
        handleOpenChange(false);
      }
    }
  };

  const populateOtherDefaults = (reason: "offline" | "error") => {
    setAiResult(null);
    setReasoning(null);
    setFallbackReason(reason);
    const otherType =
      type === "caffeine"
        ? substanceConfig.caffeine.types.find((t) => t.name === "Other")
        : substanceConfig.alcohol.types.find((t) => t.name === "Other");

    if (type === "caffeine" && otherType && "defaultMg" in otherType) {
      setOverrideAmount(String(otherType.defaultMg));
      setOverrideVolume(String(otherType.defaultVolumeMl));
    } else if (type === "alcohol" && otherType && "defaultDrinks" in otherType) {
      setOverrideAmount(String(otherType.defaultDrinks));
      setOverrideVolume(String(otherType.defaultVolumeMl));
    }
    setStep("other-result");
  };

  const handleOtherSubmit = async () => {
    if (!customDescription.trim()) return;

    // Offline: skip the network call entirely (and the loading state) and
    // fall through to defaults.
    if (isOffline()) {
      populateOtherDefaults("offline");
      return;
    }

    setIsEnriching(true);

    try {
      const authHeaders = await getAuthHeader();
      const response = await fetch("/api/ai/substance-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          description: customDescription.trim(),
          type,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiResult(data);
        setReasoning(data.reasoning || null);
        setFallbackReason(null);

        if (type === "caffeine") {
          setOverrideAmount(String(data.caffeineMg ?? ""));
          setOverrideVolume(String(data.volumeMl ?? ""));
        } else {
          setOverrideAmount(String(data.standardDrinks ?? ""));
          setOverrideVolume(String(data.volumeMl ?? ""));
        }
        setStep("other-result");
      } else {
        populateOtherDefaults("error");
      }
    } catch {
      // Network error -- fallback to defaults. If the device dropped
      // connection mid-request, surface that to the user instead of a
      // generic "AI estimation unavailable" so the banner copy matches
      // the pre-flight offline path.
      populateOtherDefaults(isOffline() ? "offline" : "error");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleConfirmOther = () => {
    const amt = parseFloat(overrideAmount) || 0;
    const vol = parseFloat(overrideVolume) || 0;

    if (type === "caffeine") {
      onSelect({
        name: "Other",
        amountMg: amt,
        volumeMl: vol,
        description: customDescription.trim(),
      });
    } else {
      onSelect({
        name: "Other",
        amountStandardDrinks: amt,
        volumeMl: vol,
        description: customDescription.trim(),
      });
    }
    handleOpenChange(false);
  };

  const amountLabel = type === "caffeine" ? "Caffeine (mg)" : "Standard Drinks";

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader>
            <DrawerTitle>
              {type === "caffeine" ? "Add Caffeine" : "Add Alcohol"}
            </DrawerTitle>
            <DrawerDescription>
              {step === "select" && "Choose a type or select Other for custom entry"}
              {step === "other-input" && "Describe what you had"}
              {step === "other-result" && "Review and confirm amounts"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-4 pb-8">
            {/* Step 1: Type Selection Grid */}
            {step === "select" && (
              <div className="grid grid-cols-2 gap-3">
                {type === "caffeine" &&
                  substanceConfig.caffeine.types.map((t) => (
                    <Button
                      key={t.name}
                      variant="outline"
                      className="h-16 flex flex-col gap-1"
                      onClick={() => handleSelectType(t.name)}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.name === "Other" ? "Custom entry" : `${t.defaultMg}mg`}
                      </span>
                    </Button>
                  ))}
                {type === "alcohol" &&
                  substanceConfig.alcohol.types.map((t) => (
                    <Button
                      key={t.name}
                      variant="outline"
                      className="h-16 flex flex-col gap-1"
                      onClick={() => handleSelectType(t.name)}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.name === "Other"
                          ? "Custom entry"
                          : `${t.defaultDrinks} drink${t.defaultDrinks !== 1 ? "s" : ""}`}
                      </span>
                    </Button>
                  ))}
              </div>
            )}

            {/* Step 2: Other - Description Input */}
            {step === "other-input" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="substance-description">
                    Description
                  </Label>
                  <Input
                    id="substance-description"
                    placeholder={
                      type === "caffeine"
                        ? "e.g. double espresso, matcha latte"
                        : "e.g. craft IPA 7%, glass of red wine"
                    }
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleOtherSubmit();
                    }}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("select")}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!customDescription.trim() || isEnriching}
                    onClick={handleOtherSubmit}
                  >
                    {isEnriching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Estimating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Estimate with AI
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Other - Result with manual override */}
            {step === "other-result" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {customDescription}
                </p>

                {reasoning && (
                  <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3 inline mr-1" />
                    {reasoning}
                  </div>
                )}

                {!aiResult && fallbackReason && (
                  <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 p-3 text-xs text-yellow-700 dark:text-yellow-400">
                    {fallbackReason === "offline"
                      ? "You're offline — using default values. Adjust below."
                      : "AI estimation unavailable. Using default values -- you can adjust below."}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="override-amount">
                      <Edit3 className="w-3 h-3 inline mr-1" />
                      {amountLabel}
                    </Label>
                    <Input
                      id="override-amount"
                      type="number"
                      min="0"
                      step={type === "caffeine" ? "1" : "0.1"}
                      value={overrideAmount}
                      onChange={(e) => setOverrideAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="override-volume">
                      <Edit3 className="w-3 h-3 inline mr-1" />
                      Volume (ml)
                    </Label>
                    <Input
                      id="override-volume"
                      type="number"
                      min="0"
                      step="1"
                      value={overrideVolume}
                      onChange={(e) => setOverrideVolume(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("other-input")}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleConfirmOther}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
