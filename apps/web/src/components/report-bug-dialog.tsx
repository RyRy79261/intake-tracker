"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { Textarea } from "@intake/ui/textarea";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@intake/ui/collapsible";
import {
  Bug,
  Lightbulb,
  Mic,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { useApiKeyStatus } from "@/hooks/use-ai-keys";
import { useSubmitBugReport } from "@/hooks/use-bug-report";
import { useToast } from "@intake/ui/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import {
  collectEnvironmentInfo,
  collectRecentErrorLogs,
  type BugReportType,
  type EnvField,
  type BugReportErrorLog,
} from "@/lib/bug-report";

interface ReportBugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: BugReportType;
  defaultDescription?: string;
}

export function ReportBugDialog({
  open,
  onOpenChange,
  defaultType = "bug",
  defaultDescription = "",
}: ReportBugDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { data: keyStatus } = useApiKeyStatus();
  const submit = useSubmitBugReport();

  const anthropicConfigured = Boolean(keyStatus?.anthropic?.configured);
  const groqConfigured = Boolean(keyStatus?.groq?.configured);

  const [type, setType] = useState<BugReportType>(defaultType);
  const [description, setDescription] = useState(defaultDescription);
  const [transcript, setTranscript] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [dictating, setDictating] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [env, setEnv] = useState<EnvField[] | null>(null);
  const [logs, setLogs] = useState<BugReportErrorLog[] | null>(null);

  // Reset + collect diagnostics on each closed→open transition only. Deps are
  // intentionally just [open]: late `defaultType` / `defaultDescription` prop
  // updates must NOT wipe a draft the user is already typing.
  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setDescription(defaultDescription);
    setTranscript("");
    setUseAi(true);
    setDictating(false);
    setDiagOpen(false);
    setEnv(null);
    setLogs(null);
    submit.reset();
    void collectEnvironmentInfo().then(setEnv);
    void collectRecentErrorLogs().then(setLogs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRecorded = useCallback(
    async (blob: Blob, mimeType: string) => {
      const form = new FormData();
      form.append("audio", new File([blob], "report.webm", { type: mimeType }));
      try {
        const res = await apiFetch("/api/ai/voice-transcribe", {
          method: "POST",
          body: form,
        });
        const body = (await res.json().catch(() => ({}))) as {
          text?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? "Transcription failed");
        const text = (body.text ?? "").trim();
        if (text) {
          setDescription((prev) => (prev ? `${prev}\n${text}` : text));
          setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
        }
      } catch (e) {
        toast({
          title: "Voice transcription failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const effectiveUseAi = useAi && anthropicConfigured;
  const diagnosticsReady = env !== null && logs !== null;
  // Gate submit until diagnostics finish loading so a fast click can't file
  // a report with empty environment/log arrays. The reads are sub-100ms.
  const canSubmit =
    description.trim().length > 0 && !submit.isPending && diagnosticsReady;

  const handleSubmit = () => {
    const aiKeyFields: EnvField[] = [
      {
        label: "AI: Anthropic key",
        value: anthropicConfigured ? "configured" : "not configured",
      },
      {
        label: "AI: Groq key",
        value: groqConfigured ? "configured" : "not configured",
      },
    ];
    submit.mutate(
      {
        type,
        description: description.trim(),
        ...(transcript ? { transcript } : {}),
        useAi: effectiveUseAi,
        diagnostics: {
          environment: [...(env ?? []), ...aiKeyFields],
          errorLogs: logs ?? [],
        },
      },
      {
        onError: (e) => {
          toast({
            title: "Could not file the report",
            description: e.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const result = submit.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                Report filed
              </DialogTitle>
              <DialogDescription>
                Issue #{result.number} was created on GitHub.
              </DialogDescription>
            </DialogHeader>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary underline underline-offset-4"
            >
              <ExternalLink className="h-4 w-4" />
              View issue #{result.number}
            </a>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {type === "bug" ? "Report a bug" : "Request a feature"}
              </DialogTitle>
              <DialogDescription>
                {type === "bug"
                  ? "Files a GitHub issue. Environment info and recent error logs are attached automatically, with personal data removed."
                  : "Files a GitHub issue as a feature request. Environment info is attached automatically, with personal data removed."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={type === "bug" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setType("bug")}
                >
                  <Bug className="h-4 w-4" />
                  Bug
                </Button>
                <Button
                  type="button"
                  variant={type === "feature" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setType("feature")}
                >
                  <Lightbulb className="h-4 w-4" />
                  Feature
                </Button>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="bug-description">
                  {type === "bug"
                    ? "What went wrong?"
                    : "What would you like to see?"}
                </Label>
                <Textarea
                  id="bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder={
                    type === "bug"
                      ? "What you did, what you expected, and what happened instead."
                      : "Describe the capability or improvement you have in mind."
                  }
                />
              </div>

              {/* Voice dictation — only when a Groq key is configured */}
              {groqConfigured && (
                <div className="space-y-2">
                  {dictating ? (
                    <div className="rounded-md border p-3">
                      <VoiceRecorder onRecorded={handleRecorded} />
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setDictating(true)}
                    >
                      <Mic className="h-4 w-4" />
                      Dictate instead
                    </Button>
                  )}
                </div>
              )}

              {/* AI restructuring toggle — only when an Anthropic key exists */}
              {anthropicConfigured && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="bug-use-ai" className="text-sm">
                      Improve with AI
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Restructures your report into a clear title and steps.
                    </p>
                  </div>
                  <Switch
                    id="bug-use-ai"
                    checked={useAi}
                    onCheckedChange={setUseAi}
                  />
                </div>
              )}

              {/* Diagnostics preview */}
              <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between px-2 text-xs text-muted-foreground"
                  >
                    <span>
                      What will be attached
                      {env && logs
                        ? ` (${env.length} env fields, ${logs.length} log entries)`
                        : ""}
                    </span>
                    {diagOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  {!env || !logs ? (
                    <p className="text-xs text-muted-foreground px-2">
                      Collecting diagnostics…
                    </p>
                  ) : (
                    <div className="space-y-2 rounded-md border p-2 text-[11px]">
                      <div className="space-y-0.5">
                        {env.map((f) => (
                          <div key={f.label} className="flex gap-2">
                            <span className="text-muted-foreground shrink-0 w-28">
                              {f.label}
                            </span>
                            <span className="font-mono break-all">{f.value}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-muted-foreground">
                        {logs.length} recent error-log{" "}
                        {logs.length === 1 ? "entry" : "entries"} will be
                        attached. All text is stripped of emails, phone numbers
                        and ID-like numbers before sending.
                      </p>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submit.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {submit.isPending ? "Filing…" : "Submit report"}
              </Button>
            </DialogFooter>

            {/* A loud, separate destination below the bug-report form: a shake
                often means "how does this work?", not "this is broken". */}
            <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                <h3 className="font-semibold text-sky-900 dark:text-sky-50">
                  Wanna read the manual?
                </h3>
              </div>
              <p className="mt-1.5 text-sm text-sky-800/80 dark:text-sky-200/80">
                We have a full manual that walks you through how every card,
                button and feature works — step by step.
              </p>
              <Button
                className="mt-3 w-full gap-2 bg-sky-600 text-white hover:bg-sky-700"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/help");
                }}
              >
                <BookOpen className="h-4 w-4" />
                Open the manual
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
