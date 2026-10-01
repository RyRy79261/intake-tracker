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
import {
  Bug,
  Lightbulb,
  Mic,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { useAuth } from "@/components/auth-guard";
import { Tog, flabelClass, plainboxClass } from "@/components/settings/settings-kit";
import { useApiKeyStatus } from "@/hooks/use-ai-keys";
import { useSubmitBugReport } from "@/hooks/use-bug-report";
import { useToast } from "@intake/ui/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { domainStripeStyle } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";
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

const REPORT_TYPES = [
  ["bug", "Bug", Bug],
  ["feature", "Feature", Lightbulb],
] as const;

/**
 * Bug report / feature request dialog (the prototype's `MD.bug`). Files a
 * GitHub issue through `/api/bug-report`; the AI helpers (dictation and
 * "Improve with AI") only show while signed in with the matching key.
 */
export function ReportBugDialog({
  open,
  onOpenChange,
  defaultType = "bug",
  defaultDescription = "",
}: ReportBugDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { authenticated } = useAuth();
  const { data: keyStatus } = useApiKeyStatus();
  const submit = useSubmitBugReport();

  const anthropicConfigured = Boolean(keyStatus?.anthropic?.configured);
  const groqConfigured = Boolean(keyStatus?.groq?.configured);
  // AI helpers stay sign-in gated. The key-status query only runs while
  // signed in, but gate explicitly so a stale cache can't surface them.
  const canImprove = authenticated && anthropicConfigured;
  const canDictate = authenticated && groqConfigured;

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

  const effectiveUseAi = useAi && canImprove;
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
  const bug = type === "bug";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="report-bug-dialog"
        style={domainStripeStyle(result ? "weight" : "bp")}
        className="flex w-[calc(100%-24px)] max-w-[460px] flex-col gap-0 border-line bg-card p-0 shadow-[inset_0_3px_0_var(--c)]"
      >
        {result ? (
          <>
            <DialogHeader className={headClass}>
              <DialogTitle className={titleClass}>
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-weight" />
                Report filed
              </DialogTitle>
              <DialogDescription className={descClass}>
                Issue <span className="num">#{result.number}</span> was created
                on GitHub.
              </DialogDescription>
            </DialogHeader>
            <div className={bodyClass}>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 self-start font-medium text-water underline underline-offset-[3px]"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                <span>
                  View issue <span className="num">#{result.number}</span>
                </span>
              </a>
            </div>
            <DialogFooter className={footClass}>
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className={headClass}>
              <DialogTitle className={titleClass}>
                {bug ? "Report a bug" : "Request a feature"}
              </DialogTitle>
              <DialogDescription className={descClass}>
                {bug
                  ? "Files a GitHub issue. Environment info and recent error logs are attached automatically, with personal data removed."
                  : "Files a GitHub issue as a feature request. Environment info is attached automatically, with personal data removed."}
              </DialogDescription>
            </DialogHeader>

            <div className={bodyClass}>
              {/* Type toggle (`.seg.full`) */}
              <div
                role="radiogroup"
                aria-label="Report type"
                className="flex border border-muted-foreground"
              >
                {REPORT_TYPES.map(([v, label, Icon], i) => {
                  const on = type === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setType(v)}
                      className={cn(
                        "flex min-h-11 flex-1 items-center justify-center gap-1.5 text-[0.8125rem] font-medium focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring",
                        i > 0 && "border-l border-muted-foreground",
                        on && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="bug-description" className={flabelClass}>
                  {bug ? "What went wrong?" : "What would you like to see?"}
                </label>
                <Textarea
                  id="bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-[132px] resize-y border-muted-foreground text-[0.9375rem]"
                  placeholder={
                    bug
                      ? "What you did, what you expected, and what happened instead."
                      : "Describe the capability or improvement you have in mind."
                  }
                />
              </div>

              {/* Voice dictation: signed in, with a Groq key */}
              {canDictate &&
                (dictating ? (
                  <div
                    data-testid="bug-dictation"
                    className="flex flex-col gap-2.5 border border-line p-2.5 text-[0.8125rem]"
                  >
                    <p className="text-muted-foreground">
                      Speak your report. The words are added to the text above.
                    </p>
                    <VoiceRecorder onRecorded={handleRecorded} />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start border-muted-foreground"
                    onClick={() => setDictating(true)}
                  >
                    <Mic aria-hidden="true" />
                    Dictate instead
                  </Button>
                ))}

              {/* AI restructuring: signed in, with an Anthropic key */}
              {canImprove && (
                <div className={cn(plainboxClass, "py-0.5")}>
                  <Tog
                    id="bug-use-ai"
                    label="Improve with AI"
                    description="Restructures your report into a clear title and steps."
                    checked={useAi}
                    onCheckedChange={setUseAi}
                  />
                </div>
              )}

              {/* Diagnostics disclosure */}
              <div>
                <button
                  type="button"
                  aria-expanded={diagOpen}
                  aria-controls="bug-diagnostics"
                  onClick={() => setDiagOpen((o) => !o)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-xs text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span>
                    What will be attached
                    {env && logs && (
                      <>
                        {" ("}
                        <span className="num">{env.length}</span> env fields,{" "}
                        <span className="num">{logs.length}</span> log entries)
                      </>
                    )}
                  </span>
                  {diagOpen ? (
                    <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                  )}
                </button>
                {diagOpen && (
                  <div
                    id="bug-diagnostics"
                    data-testid="bug-diagnostics"
                    className="flex flex-col gap-1 border border-line p-2 text-[0.6875rem] leading-[1.35]"
                  >
                    {!env || !logs ? (
                      <p className="text-muted-foreground">Collecting diagnostics…</p>
                    ) : (
                      <>
                        {env.map((f) => (
                          <div
                            key={f.label}
                            className="grid grid-cols-[7.5em_minmax(0,1fr)] gap-2"
                          >
                            <span className="text-muted-foreground">{f.label}</span>
                            <span className="num [overflow-wrap:anywhere]">{f.value}</span>
                          </div>
                        ))}
                        <p className="mt-1 text-muted-foreground">
                          <span className="num">{logs.length}</span> recent
                          error-log {logs.length === 1 ? "entry" : "entries"} will
                          be attached. All text is stripped of emails, phone
                          numbers and ID-like numbers before sending.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* A loud, separate destination below the form: a shake often
                  means "how does this work?", not "this is broken". */}
              <div
                data-testid="bug-manual-box"
                data-domain="water"
                className="flex flex-col gap-1.5 border border-water bg-water/10 p-3"
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <BookOpen aria-hidden="true" className="h-5 w-5 text-water" />
                  Wanna read the manual?
                </h3>
                <p className="text-[0.8125rem] leading-[1.45] text-muted-foreground">
                  We have a full manual that walks you through how every card,
                  button and feature works — step by step.
                </p>
                <Button
                  className="mt-1"
                  onClick={() => {
                    onOpenChange(false);
                    router.push("/help");
                  }}
                >
                  <BookOpen aria-hidden="true" />
                  Open the manual
                </Button>
              </div>
            </div>

            <DialogFooter className={footClass}>
              <Button
                variant="outline"
                className="flex-1 border-muted-foreground"
                onClick={() => onOpenChange(false)}
                disabled={submit.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
                {submit.isPending && (
                  <Spinner />
                )}
                {submit.isPending ? "Filing…" : "Submit report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// The prototype's dialog frame: `.dlg-h`, `.dlg-b` and `.dlg-f`.
const headClass = "shrink-0 space-y-1 pb-2.5 pl-4 pr-12 pt-3.5 text-left sm:text-left";
const titleClass = "flex items-center gap-2 text-base font-semibold leading-[1.3]";
const descClass = "text-[0.8125rem] leading-[1.45]";
const bodyClass =
  "flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-3.5 pt-0.5 text-sm [&>*]:shrink-0";
const footClass =
  "shrink-0 flex-row gap-2 border-t border-line px-4 py-3 sm:space-x-0";
