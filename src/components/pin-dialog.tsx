"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, KeyRound, AlertCircle, Loader2, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export type PinDialogMode = "enter" | "setup" | "change" | "remove";

interface PinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PinDialogMode;
  onSubmit: (pin: string, newPin?: string) => Promise<boolean>;
  onCancel?: () => void;
}

const PIN_LENGTH = 4;

const modeConfig = {
  enter: {
    title: "Enter PIN",
    description: "Enter your PIN to access protected features",
    icon: Lock,
    submitLabel: "Unlock",
    showNewPin: false,
  },
  setup: {
    title: "Set Up PIN",
    description: "Create a PIN to protect sensitive features",
    icon: KeyRound,
    submitLabel: "Set PIN",
    showNewPin: true,
  },
  change: {
    title: "Change PIN",
    description: "Enter your current PIN, then your new PIN",
    icon: KeyRound,
    submitLabel: "Change PIN",
    showNewPin: true,
  },
  remove: {
    title: "Remove PIN",
    description: "Enter your PIN to remove protection",
    icon: Unlock,
    submitLabel: "Remove PIN",
    showNewPin: false,
  },
};

// PIN display dots
function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-4 h-4 rounded-full border-2 transition-all duration-150",
            i < filled
              ? "bg-primary border-primary scale-110"
              : "bg-transparent border-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

// Numeric keypad
function NumericKeypad({
  onDigit,
  onDelete,
  onClear,
  disabled,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const buttons = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["clear", "0", "delete"],
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {buttons.flat().map((btn) => {
        if (btn === "delete") {
          return (
            <Button
              key={btn}
              variant="ghost"
              size="lg"
              className="h-14 text-lg"
              onClick={onDelete}
              disabled={disabled}
            >
              <Delete className="w-5 h-5" />
            </Button>
          );
        }
        if (btn === "clear") {
          return (
            <Button
              key={btn}
              variant="ghost"
              size="lg"
              className="h-14 text-sm text-muted-foreground"
              onClick={onClear}
              disabled={disabled}
            >
              Clear
            </Button>
          );
        }
        return (
          <Button
            key={btn}
            variant="outline"
            size="lg"
            className="h-14 text-xl font-semibold"
            onClick={() => onDigit(btn)}
            disabled={disabled}
          >
            {btn}
          </Button>
        );
      })}
    </div>
  );
}

export function PinDialog({
  open,
  onOpenChange,
  mode,
  onSubmit,
  onCancel,
}: PinDialogProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;

  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"current" | "new" | "confirm">("current");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      setPin("");
      setNewPin("");
      setConfirmPin("");
      setStep(mode === "setup" ? "new" : "current");
      setError(null);
      setIsSubmitting(false);
    }
  }, [open, mode]);

  // Get current input based on step
  const currentInput = step === "current" ? pin : step === "new" ? newPin : confirmPin;
  const setCurrentInput = step === "current" ? setPin : step === "new" ? setNewPin : setConfirmPin;

  // Get label for current step
  const getStepLabel = () => {
    if (mode === "setup") {
      return step === "new" ? "Enter new PIN" : "Confirm new PIN";
    }
    if (mode === "change") {
      if (step === "current") return "Enter current PIN";
      if (step === "new") return "Enter new PIN";
      return "Confirm new PIN";
    }
    return null;
  };

  const handleDigit = useCallback((digit: string) => {
    if (currentInput.length >= PIN_LENGTH) return;
    setError(null);
    setCurrentInput(currentInput + digit);
  }, [currentInput, setCurrentInput]);

  const handleDelete = useCallback(() => {
    setError(null);
    setCurrentInput(currentInput.slice(0, -1));
  }, [currentInput, setCurrentInput]);

  const handleClear = useCallback(() => {
    setError(null);
    setCurrentInput("");
  }, [setCurrentInput]);

  // Handle PIN completion
  useEffect(() => {
    if (currentInput.length !== PIN_LENGTH) return;

    const processPin = async () => {
      // For setup mode: new -> confirm
      if (mode === "setup") {
        if (step === "new") {
          setStep("confirm");
          return;
        }
        // Confirm step - check if pins match
        if (newPin !== confirmPin) {
          setError("PINs don't match. Try again.");
          setNewPin("");
          setConfirmPin("");
          setStep("new");
          return;
        }
        // Submit the new PIN
        setIsSubmitting(true);
        try {
          const success = await onSubmit(newPin);
          if (!success) {
            setError("Failed to set PIN. Try again.");
            setNewPin("");
            setConfirmPin("");
            setStep("new");
          }
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      // For change mode: current -> new -> confirm
      if (mode === "change") {
        if (step === "current") {
          setStep("new");
          return;
        }
        if (step === "new") {
          setStep("confirm");
          return;
        }
        // Confirm step - check if new pins match
        if (newPin !== confirmPin) {
          setError("New PINs don't match. Try again.");
          setNewPin("");
          setConfirmPin("");
          setStep("new");
          return;
        }
        // Submit both PINs
        setIsSubmitting(true);
        try {
          const success = await onSubmit(pin, newPin);
          if (!success) {
            setError("Incorrect current PIN");
            setPin("");
            setNewPin("");
            setConfirmPin("");
            setStep("current");
          }
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      // For enter/remove mode: just submit the PIN
      setIsSubmitting(true);
      try {
        const success = await onSubmit(pin);
        if (!success) {
          setError("Incorrect PIN");
          setPin("");
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    // Small delay for visual feedback
    const timer = setTimeout(processPin, 150);
    return () => clearTimeout(timer);
  }, [currentInput, mode, step, pin, newPin, confirmPin, onSubmit]);

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="items-center">
          <div className="p-3 rounded-full bg-primary/10 mb-2">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription className="text-center">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step indicator for multi-step modes */}
          {getStepLabel() && (
            <p className="text-sm text-center text-muted-foreground font-medium">
              {getStepLabel()}
            </p>
          )}

          {/* PIN dots */}
          <PinDots length={PIN_LENGTH} filled={currentInput.length} />

          {/* Error message */}
          {error && (
            <div className="flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Numeric keypad */}
          <NumericKeypad
            onDigit={handleDigit}
            onDelete={handleDelete}
            onClear={handleClear}
            disabled={isSubmitting}
          />

          {/* Loading indicator */}
          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </div>
          )}

          {/* Cancel button */}
          {onCancel && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
