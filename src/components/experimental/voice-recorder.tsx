"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RecorderState = "idle" | "requesting" | "recording" | "processing" | "error";

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, mimeType: string) => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
}

// Order matters — first supported wins. webm/opus is Chrome/Edge/Firefox; mp4
// is iOS Safari 14.3+.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
];

function pickMimeType(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function VoiceRecorder({ onRecorded, busy, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // soft background
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, w, h);

      // centerline
      ctx.strokeStyle = "hsl(var(--border))";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = "hsl(var(--primary))";
      ctx.beginPath();
      const slice = w / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const sample = buf[i] ?? 128;
        const v = sample / 128.0; // 0..2, with 1 = silence
        const y = (v * h) / 2;
        const x = i * slice;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const mime = pickMimeType();
    if (!mime) {
      setError("This browser does not support MediaRecorder for audio.");
      setState("error");
      return;
    }

    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        setState("processing");
        try {
          await onRecorded(blob, mime);
        } finally {
          // Parent controls whether more processing keeps `busy` true; we go
          // back to idle either way so the record button is usable again.
          setState("idle");
          setElapsedMs(0);
        }
      };
      recorderRef.current = recorder;

      recorder.start();
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 100);
      setState("recording");
      drawWaveform();
    } catch (e) {
      cleanup();
      const message =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission denied"
          : e instanceof Error
            ? e.message
            : "Failed to access microphone";
      setError(message);
      setState("error");
    }
  }, [drawWaveform, onRecorded, cleanup]);

  const stop = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const isRecording = state === "recording";
  const isBusy = busy || state === "processing" || state === "requesting";
  const seconds = Math.floor(elapsedMs / 1000);
  const mmss = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center">
        <Button
          type="button"
          size="lg"
          variant={isRecording ? "destructive" : "default"}
          disabled={disabled || isBusy}
          onClick={isRecording ? stop : start}
          className="h-16 w-16 rounded-full p-0"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {state === "processing" || state === "requesting" ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : isRecording ? (
            <Square className="h-6 w-6 fill-current" />
          ) : (
            <Mic className="h-7 w-7" />
          )}
        </Button>
      </div>

      <div
        className={cn(
          "rounded-md border bg-muted/30 transition-colors",
          isRecording && "border-primary/40"
        )}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={80}
          className="block h-20 w-full"
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {state === "idle" && "Tap to record"}
          {state === "requesting" && "Requesting microphone…"}
          {state === "recording" && (
            <span className="text-primary">● Recording</span>
          )}
          {state === "processing" && "Processing…"}
          {state === "error" && error && (
            <span className="text-destructive">{error}</span>
          )}
        </span>
        <span className="font-mono tabular-nums">{mmss}</span>
      </div>
    </div>
  );
}
