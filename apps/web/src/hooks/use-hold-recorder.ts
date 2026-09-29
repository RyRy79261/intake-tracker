"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickMimeType } from "@/components/voice/voice-recorder";

export interface RecordedClip {
  blob: Blob;
  mimeType: string;
}

export type HoldRecorderState = "idle" | "requesting" | "recording" | "error";

export interface HoldRecorder {
  state: HoldRecorderState;
  error: string | null;
  /** Input level, 0..1, refreshed while recording (drives the level meter). */
  level: number;
  /**
   * Ask for the microphone and start recording. Resolves `ok: false` when it
   * could not start (with `error` set) or was cancelled while waiting.
   */
  start: () => Promise<{ ok: boolean; error?: string }>;
  /**
   * Stop and hand back the clip. A stop before recording actually began
   * (permission prompt still open) is a cancel and resolves null.
   */
  stop: () => Promise<RecordedClip | null>;
  /** Stop and throw the audio away. */
  cancel: () => void;
}

const LEVEL_INTERVAL_MS = 80;

/**
 * Press-and-hold microphone capture for the Ward Console "Hold to talk"
 * button. Same capture settings as `VoiceRecorder` (echo cancellation, noise
 * suppression, first supported MIME type), but driven imperatively so a
 * pointer down / pointer up pair can start and finish one clip.
 */
export function useHoldRecorder(): HoldRecorder {
  const [state, setState] = useState<HoldRecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  // Set when stop/cancel lands while getUserMedia is still pending.
  const abortedRef = useRef(false);
  const stateRef = useRef<HoldRecorderState>("idle");

  const setBoth = useCallback((s: HoldRecorderState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const release = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;
    chunksRef.current = [];
    setLevel(0);
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    if (stateRef.current === "requesting" || stateRef.current === "recording") {
      return { ok: false };
    }
    setError(null);
    abortedRef.current = false;
    const mime = pickMimeType();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      const message = "This browser cannot record audio.";
      setError(message);
      setBoth("error");
      return { ok: false, error: message };
    }
    setBoth("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      if (abortedRef.current) {
        release();
        setBoth("idle");
        return { ok: false };
      }

      // Level meter. Optional: a missing AudioContext just leaves it flat.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        let last = 0;
        const tick = (t: number) => {
          if (t - last >= LEVEL_INTERVAL_MS) {
            last = t;
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) {
              const d = (v - 128) / 128;
              sum += d * d;
            }
            // Speech RMS sits around 0.05-0.3; stretch it onto 0..1.
            setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setBoth("recording");
      return { ok: true };
    } catch (e) {
      release();
      const message =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission denied"
          : e instanceof Error
            ? e.message
            : "Failed to access microphone";
      setError(message);
      setBoth("error");
      return { ok: false, error: message };
    }
  }, [release, setBoth]);

  const cancel = useCallback(() => {
    abortedRef.current = true;
    release();
    setBoth("idle");
  }, [release, setBoth]);

  const stop = useCallback(async (): Promise<RecordedClip | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      cancel();
      return null;
    }
    const mimeType = rec.mimeType || pickMimeType() || "audio/webm";
    const clip = await new Promise<RecordedClip>((resolve) => {
      rec.onstop = () => {
        resolve({ blob: new Blob(chunksRef.current, { type: mimeType }), mimeType });
      };
      rec.stop();
    });
    release();
    setBoth("idle");
    return clip;
  }, [cancel, release, setBoth]);

  return { state, error, level, start, stop, cancel };
}
