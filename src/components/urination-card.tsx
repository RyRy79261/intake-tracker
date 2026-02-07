"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Droplet, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUrinationRecords, useAddUrination } from "@/hooks/use-urination-queries";
import { formatDateTime } from "@/lib/date-utils";

const AMOUNT_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

export function UrinationCard() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");

  const { data: recentRecords, isLoading } = useUrinationRecords(5);
  const addMutation = useAddUrination();

  const latestRecord = recentRecords?.[0];

  const handleSubmit = async (withDetails: boolean) => {
    try {
      await addMutation.mutateAsync({
        amountEstimate: withDetails ? amount || undefined : undefined,
        note: withDetails ? note || undefined : undefined,
      });
      toast({
        title: "Logged",
        description: "Urination recorded",
        variant: "success",
      });
      if (withDetails) {
        setAmount("");
        setNote("");
        setExpanded(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 border-violet-200 dark:border-violet-800">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50">
              <Droplet className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">
              Urination
            </span>
          </div>
          {isLoading ? (
            <div className="h-6 w-20 bg-violet-200 dark:bg-violet-800 rounded animate-pulse" />
          ) : latestRecord ? (
            <p className="text-xs text-muted-foreground">
              {formatDateTime(latestRecord.timestamp)}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => handleSubmit(expanded)}
            disabled={addMutation.isPending}
            className="w-full h-11 bg-violet-600 hover:bg-violet-700"
          >
            {addMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                I urinated
              </>
            )}
          </Button>

          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between text-muted-foreground hover:text-foreground"
              >
                <span>{expanded ? "Hide details" : "Add amount or note"}</span>
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 rounded-lg bg-muted/50 border space-y-3 mt-2">
                <div className="space-y-2">
                  <Label>Amount (optional)</Label>
                  <Select value={amount} onValueChange={setAmount}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select estimate" />
                    </SelectTrigger>
                    <SelectContent>
                      {AMOUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urination-note">Note (optional)</Label>
                  <Textarea
                    id="urination-note"
                    placeholder="e.g. colour, urgency"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-[60px] bg-background"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={addMutation.isPending}
                  variant="secondary"
                  className="w-full border-violet-200 dark:border-violet-800"
                >
                  {addMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Log with details"
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
