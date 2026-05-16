"use client";

import { useRouter } from "next/navigation";
import { Mic, Sparkles, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";

export function ExperimentalSection() {
  const router = useRouter();
  const settings = useSettings();
  const voiceEnabled = settings.experimentalFeatures?.voiceHealthMetrics ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          Experimental
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Unreleased features. May change, break, or disappear.
        </p>

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="voice-health-toggle" className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Voice health metrics
            </Label>
            <p className="text-xs text-muted-foreground">
              Dictate multiple metrics in one go. Uses Groq Whisper + Claude to
              extract a reviewable list of items.
            </p>
          </div>
          <Switch
            id="voice-health-toggle"
            checked={voiceEnabled}
            onCheckedChange={(v) => settings.setExperimentalFeature("voiceHealthMetrics", v)}
          />
        </div>

        {voiceEnabled && (
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => router.push("/experimental/voice")}
          >
            <span className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Open voice panel
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
