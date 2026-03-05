"use client";

import { useState, useCallback, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
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
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePerplexityKey } from "@/hooks/use-settings";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { ParsedIntakeDisplay } from "@/components/parsed-intake-display";
import { parseIntakeWithPerplexity, type ParsedIntake } from "@/lib/perplexity";
import { formatAmount } from "@/lib/utils";

interface VoiceInputProps {
  onAddWater: (amount: number, source: string) => Promise<void>;
  onAddSalt: (amount: number, source: string) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VoiceInput({ onAddWater, onAddSalt, open: controlledOpen, onOpenChange }: VoiceInputProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ? onOpenChange : setInternalOpen;
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedIntake | null>(null);
  const { toast } = useToast();
  const { getApiKey, hasKey } = usePerplexityKey();
  const { authenticated, getAccessToken } = usePrivy();

  const handleFinalTranscript = useCallback((transcript: string) => {
    setInput((prev) => prev + transcript);
  }, []);

  const {
    isListening,
    interimTranscript,
    isSpeechSupported,
    startListening,
    stopListening,
    cleanup,
  } = useSpeechRecognition(handleFinalTranscript);

  const aiAvailable = authenticated || hasKey;

  // Warn when controlled without an onOpenChange handler
  useEffect(() => {
    if (controlledOpen !== undefined && !onOpenChange) {
      console.warn(
        "VoiceInput: `open` prop was provided without an `onOpenChange` handler. " +
        "The parent must supply `onOpenChange` to fully control VoiceInput."
      );
    }
  }, [controlledOpen, onOpenChange]);

  // Clean up when the parent programmatically closes the dialog
  useEffect(() => {
    if (controlledOpen === false) {
      cleanup();
      setInput("");
      setParsedResult(null);
    }
  }, [controlledOpen, cleanup]);

  const handleParse = async () => {
    if (!input.trim()) return;

    setIsProcessing(true);
    setParsedResult(null);

    try {
      let authToken: string | undefined;
      if (authenticated) {
        authToken = await getAccessToken() || undefined;
      }

      const clientApiKey = hasKey ? getApiKey() : undefined;
      const result = await parseIntakeWithPerplexity(input, {
        ...(authToken !== undefined && { authToken }),
        ...(clientApiKey !== undefined && { clientApiKey }),
      });
      setParsedResult(result);
    } catch (error) {
      toast({
        title: "Parsing Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to parse input. Try being more specific.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsedResult) return;

    setIsProcessing(true);
    try {
      if (parsedResult.water && parsedResult.water > 0) {
        await onAddWater(parsedResult.water, "voice");
      }
      if (parsedResult.salt && parsedResult.salt > 0) {
        await onAddSalt(parsedResult.salt, "voice");
      }

      toast({
        title: "Intake recorded",
        description: `Added ${
          parsedResult.water ? formatAmount(parsedResult.water, "ml") + " water" : ""
        }${parsedResult.water && parsedResult.salt ? " and " : ""}${
          parsedResult.salt ? formatAmount(parsedResult.salt, "mg") + " salt" : ""
        }`,
        variant: "success",
      });

      setOpen(false);
      setInput("");
      setParsedResult(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to record intake",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setInput("");
      setParsedResult(null);
      stopListening();
    }
  };

  if (!aiAvailable) {
    return (
      <Button
        variant="outline"
        disabled
        className="flex-1 h-12 gap-2 opacity-50"
        title="Sign in or add your own API key to enable AI features"
      >
        <Mic className="w-5 h-5" />
        <span>AI Input</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex-1 h-12 gap-2 bg-gradient-to-r from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 border-violet-200 dark:from-violet-950/30 dark:to-purple-950/30 dark:hover:from-violet-900/40 dark:hover:to-purple-900/40 dark:border-violet-800"
        >
          <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <span>AI Input</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            Natural Language Input
          </DialogTitle>
          <DialogDescription>
            Describe what you ate or drank in plain language, and AI will parse
            it into water and salt intake.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="natural-input">Describe your intake</Label>
            <div className="flex gap-2">
              <Input
                id="natural-input"
                value={isListening ? input + interimTranscript : input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening..." : "Type or tap mic to speak..."}
                className="h-12 flex-1"
                disabled={isListening}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleParse();
                  }
                }}
              />
              {isSpeechSupported && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={`h-12 w-12 shrink-0 ${
                    isListening
                      ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                      : ""
                  }`}
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessing}
                >
                  {isListening ? (
                    <MicOff className="w-5 h-5 text-red-500 animate-pulse" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </Button>
              )}
            </div>
            {isListening && (
              <p className="text-xs text-violet-600 dark:text-violet-400 animate-pulse">
                Listening... speak now
              </p>
            )}
            {!isListening && (
              <p className="text-xs text-muted-foreground">
                Examples: &quot;a cup of coffee&quot;, &quot;300g watermelon&quot;,
                &quot;a bag of chips&quot;
              </p>
            )}
          </div>

          {!parsedResult && (
            <Button
              onClick={handleParse}
              disabled={isProcessing || !input.trim()}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Parse with AI
                </>
              )}
            </Button>
          )}

          {/* Parsed Result Preview */}
          {parsedResult && (
            <ParsedIntakeDisplay
              result={parsedResult}
              onTryAgain={() => setParsedResult(null)}
              onConfirm={handleConfirm}
              isProcessing={isProcessing}
            />
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <p className="text-xs text-muted-foreground">
            Powered by Perplexity AI
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
