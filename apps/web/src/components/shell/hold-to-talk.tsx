"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@intake/ui/sheet";
import { useToast } from "@intake/ui/use-toast";
import { VoicePanel } from "@/components/voice/voice-panel";
import { useHoldRecorder, type RecordedClip } from "@/hooks/use-hold-recorder";
import { ShellIcon } from "@/components/shell/shell-icon";
import { cn } from "@/lib/utils";

/** A press shorter than this is a tap: show how to use it instead. */
export const HOLD_MIN_MS = 350;
/** Sliding the finger further than this from where it went down cancels. */
export const HOLD_CANCEL_DISTANCE_PX = 70;
const HINT_MS = 4000;
const LEVEL_BARS = 20;

type Phase = "listen" | "hint" | null;

/** Bottom offset that puts a panel just above the bottom bar. */
const ABOVE_BOTTOM_BAR = "calc(56px + env(safe-area-inset-bottom, 0px) + 8px)";
/** Bottom offset that puts a panel just above the desk band (desktop). */
const ABOVE_DESK_BAND = "calc(72px + env(safe-area-inset-bottom, 0px) + 8px)";

/**
 * "Hold to talk": the AI voice logger on a press-and-hold button.
 *
 * Pointer down starts recording, pointer up sends the clip to the existing
 * VoicePanel for transcription, parsing and review, and sliding the finger
 * away before letting go cancels. Space/Enter work the same way from the
 * keyboard. Render only when signed in (the caller checks `useAuthGate`).
 *
 * `variant="cell"` is the bottom bar cell, with its panels just above the
 * bar. `variant="corner"` is the square button at the bottom right of the
 * desktop (the desk band), with its panels just above it on the right.
 */
export function HoldToTalk({ className, variant = "cell" }: { className?: string; variant?: "cell" | "corner" }) {
  const corner = variant === "corner";
  const recorder = useHoldRecorder();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>(null);
  const [cancelling, setCancelling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const originRef = useRef<{ x: number; y: number } | null>(null);
  const startedAtRef = useRef(0);
  const cancellingRef = useRef(false);
  const holdingRef = useRef(false);

  // Timer while listening.
  useEffect(() => {
    if (phase !== "listen") return;
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(id);
  }, [phase]);

  // The tap hint goes away on its own.
  useEffect(() => {
    if (phase !== "hint") return;
    const id = setTimeout(() => setPhase(null), HINT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const begin = useCallback(
    (x: number, y: number) => {
      if (holdingRef.current) return;
      holdingRef.current = true;
      originRef.current = { x, y };
      startedAtRef.current = Date.now();
      cancellingRef.current = false;
      setCancelling(false);
      setElapsed(0);
      setPhase("listen");
      void recorder.start().then((res) => {
        if (res.ok || !res.error) return;
        // Could not open the microphone: drop the listening panel.
        holdingRef.current = false;
        setPhase(null);
        toast({ title: "Microphone unavailable", description: res.error, variant: "destructive" });
      });
    },
    [recorder, toast],
  );

  const finish = useCallback(
    async (cancel: boolean) => {
      if (!holdingRef.current) return;
      holdingRef.current = false;
      const held = Date.now() - startedAtRef.current;
      if (cancel || cancellingRef.current) {
        recorder.cancel();
        setPhase(null);
        toast({ title: "Cancelled · nothing logged" });
        return;
      }
      if (held < HOLD_MIN_MS) {
        recorder.cancel();
        setPhase("hint");
        return;
      }
      setPhase(null);
      const recorded = await recorder.stop();
      if (!recorded) return;
      setClip(recorded);
      setReviewOpen(true);
    },
    [recorder, toast],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best effort */
    }
    begin(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const o = originRef.current;
    if (!holdingRef.current || !o) return;
    const away = Math.hypot(e.clientX - o.x, e.clientY - o.y) > HOLD_CANCEL_DISTANCE_PX;
    if (away !== cancellingRef.current) {
      cancellingRef.current = away;
      setCancelling(away);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && holdingRef.current) {
      e.preventDefault();
      void finish(true);
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      begin(r.left + r.width / 2, r.top + r.height / 2);
    }
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      void finish(false);
    }
  };

  const listening = phase === "listen";
  const seconds = Math.floor(elapsed / 1000);
  const litBars = cancelling
    ? 0
    : recorder.state === "recording"
      ? Math.max(1, Math.round(recorder.level * LEVEL_BARS))
      : 0;

  return (
    <>
      <button
        type="button"
        data-mic
        aria-label={corner ? "Hold to talk" : "Hold to talk to the AI logger"}
        title={corner ? "Hold to talk" : undefined}
        aria-pressed={listening}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => void finish(false)}
        onPointerCancel={() => void finish(true)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative flex items-center justify-center border",
          corner ? "h-14 w-14 shrink-0 flex-col gap-0.5" : "min-h-11 flex-col gap-1",
          "touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]",
          listening
            ? "border-ai bg-ai text-on-domain"
            : "border-ai bg-panel text-ai",
          className,
        )}
      >
        <ShellIcon name="mic" size={20} />
        <span className={cn("whitespace-nowrap font-medium", corner ? "text-[0.6875rem]" : "text-xs")}>
          {corner ? "Talk" : "Hold to talk"}
        </span>
      </button>

      {listening && (
        <div
          className={cn("pointer-events-none fixed z-[65]", corner ? "right-1.5 w-[400px]" : "inset-x-2")}
          style={{ bottom: corner ? ABOVE_DESK_BAND : ABOVE_BOTTOM_BAR }}
        >
          <div
            role="dialog"
            aria-label="AI logger listening"
            data-testid="hold-to-talk-listening"
            data-cancelling={cancelling || undefined}
            className={cn("border-2 bg-panel", cancelling ? "border-muted-foreground" : "border-ai")}
          >
            <div className="flex h-10 items-center gap-2 border-b border-line bg-chrome pl-3.5">
              <span className="inline-flex items-center gap-1 text-ai">
                <ShellIcon name="mic" size={20} />
                <span className="text-xs font-semibold uppercase tracking-[0.06em]">
                  AI · Listening
                </span>
              </span>
              {/* Visual only: a live timer would be read out every second
                  while the user is talking. */}
              <span className="num ml-auto mr-3" aria-hidden="true" data-testid="hold-to-talk-timer">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="px-3.5 py-3">
              <div className="flex h-[22px] gap-[2px] border border-muted-foreground p-[2px]" aria-hidden="true">
                {Array.from({ length: LEVEL_BARS }, (_, i) => (
                  <i key={i} className={cn("flex-1", i < litBars ? "bg-ai" : "bg-foreground/10")} />
                ))}
              </div>
              <p className="mb-2 mt-3 min-h-[3em] text-[1.0625rem] text-muted-foreground" aria-live="polite">
                {recorder.state === "requesting"
                  ? "Waiting for the microphone…"
                  : "Say what you ate or drank"}
              </p>
              <p className="text-[0.8125rem] text-muted-foreground" aria-live="polite">
                {cancelling
                  ? "Release to cancel · nothing will be logged"
                  : "Release to review · Slide away to cancel"}
              </p>
            </div>
          </div>
        </div>
      )}

      {phase === "hint" && (
        <div
          className="fixed inset-x-0 top-0 z-[64]"
          style={{ bottom: corner ? "calc(72px + env(safe-area-inset-bottom, 0px))" : "calc(56px + env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Dismiss"
            onClick={() => setPhase(null)}
          />
          <div
            role="dialog"
            aria-label="AI logger"
            className={cn(
              "pointer-events-none absolute border-2 border-ai bg-panel px-3.5 py-3",
              corner ? "bottom-2 right-1.5 w-[400px]" : "inset-x-2 bottom-2",
            )}
          >
            <p>
              <span className="mr-1 inline-flex items-center gap-1 align-middle text-ai">
                <ShellIcon name="mic" size={16} />
                AI
              </span>
              Press and hold to talk. Release to review what AI understood.
            </p>
          </div>
        </div>
      )}

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent
          side="full"
          open={reviewOpen}
          className="flex h-full w-full flex-col overflow-hidden"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Voice log</SheetTitle>
          <VoicePanel initialClip={clip} onCommitted={() => setReviewOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
