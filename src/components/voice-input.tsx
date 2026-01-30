"use client";

import { useState } from "react";
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
import { Mic, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePerplexityKey } from "@/hooks/use-settings";
import { parseIntakeWithPerplexity, type ParsedIntake } from "@/lib/perplexity";
import { formatAmount } from "@/lib/utils";

interface VoiceInputProps {
  onAddWater: (amount: number, source: string) => Promise<void>;
  onAddSalt: (amount: number, source: string) => Promise<void>;
}

export function VoiceInput({ onAddWater, onAddSalt }: VoiceInputProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedIntake | null>(null);
  const { toast } = useToast();
  const { getApiKey, hasKey } = usePerplexityKey();
  const { authenticated, getAccessToken } = usePrivy();
  
  // AI is available if user is authenticated (uses server key) OR has their own API key
  const aiAvailable = authenticated || hasKey;

  const handleParse = async () => {
    if (!input.trim()) return;

    setIsProcessing(true);
    setParsedResult(null);

    try {
      // Get Privy access token if authenticated
      let authToken: string | undefined;
      if (authenticated) {
        authToken = await getAccessToken() || undefined;
      }

      const result = await parseIntakeWithPerplexity(input, {
        authToken,
        clientApiKey: hasKey ? getApiKey() : undefined,
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
    } catch (error) {
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
            <Input
              id="natural-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., I ate 200g of grapes and drank a glass of water"
              className="h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleParse();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Examples: &quot;a cup of coffee&quot;, &quot;300g watermelon&quot;,
              &quot;a bag of chips&quot;
            </p>
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
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-muted/50 border">
                <p className="text-sm text-muted-foreground mb-3">
                  Parsed result:
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30">
                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                      {parsedResult.water
                        ? formatAmount(parsedResult.water, "ml")
                        : "0ml"}
                    </p>
                    <p className="text-xs text-muted-foreground">Water</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {parsedResult.salt
                        ? formatAmount(parsedResult.salt, "mg")
                        : "0mg"}
                    </p>
                    <p className="text-xs text-muted-foreground">Salt</p>
                  </div>
                </div>
                {parsedResult.reasoning && (
                  <p className="text-xs text-muted-foreground mt-3 italic">
                    {parsedResult.reasoning}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setParsedResult(null)}
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={
                    isProcessing ||
                    (!parsedResult.water && !parsedResult.salt)
                  }
                  className="flex-1 bg-violet-600 hover:bg-violet-700"
                >
                  {isProcessing ? "Adding..." : "Confirm & Add"}
                </Button>
              </div>
            </div>
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
