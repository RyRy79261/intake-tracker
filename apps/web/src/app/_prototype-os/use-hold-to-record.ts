"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Press-and-hold voice recording for the bottom bar's "Hold to talk" button.
// Press (pointer, or Space/Enter held) starts the microphone; release sends
// the clip; sliding well off the button arms a cancel, and releasing there
// (or Esc, or the system cancelling the pointer) throws the clip away. A
// hold shorter than `minMs` is treated as a tap and discarded; a hold that
// reaches `maxMs` stops and sends by itself. The clip goes to `onRecorded`,
// which the variants hand to the real VoicePanel (its `initialRecording`).

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export type HoldPhase = "idle" | "starting" | "recording" | "cancel-armed";
export type HoldNotice = "too-short" | "cancelled" | "max-length" | "error" | null;

export interface HoldToRecordOptions {
  onRecorded: (blob: Blob, mimeType: string) => void;
  /** The longest clip; reaching it stops and sends. */
  maxMs?: number;
  /** Shorter than this is a tap, not a recording. */
  minMs?: number;
  /** How far (px) off the button the finger must slide to arm a cancel. */
  cancelMargin?: number;
  /** Test seams. */
  getStream?: () => Promise<MediaStream>;
  createRecorder?: (stream: MediaStream, mimeType: string | undefined) => MediaRecorder;
  now?: () => number;
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

interface Session {
  released: boolean;
  discard: boolean;
  startedAt: number;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  maxTimer: ReturnType<typeof setTimeout> | null;
  tick: ReturnType<typeof setInterval> | null;
}

export function useHoldToRecord({
  onRecorded,
  maxMs = 60_000,
  minMs = 400,
  cancelMargin = 48,
  getStream = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
  createRecorder = (stream, mimeType) => new MediaRecorder(stream, mimeType ? { mimeType } : undefined),
  now = () => Date.now(),
}: HoldToRecordOptions) {
  const [phase, setPhase] = useState<HoldPhase>("idle");
  const [notice, setNotice] = useState<HoldNotice>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const session = useRef<Session | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const armed = useRef(false);
  const deliver = useRef(onRecorded);
  const opts = useRef({ maxMs, minMs, cancelMargin, getStream, createRecorder, now });
  useEffect(() => {
    deliver.current = onRecorded;
    opts.current = { maxMs, minMs, cancelMargin, getStream, createRecorder, now };
  });

  const teardown = useCallback((s: Session) => {
    if (s.maxTimer) clearTimeout(s.maxTimer);
    if (s.tick) clearInterval(s.tick);
    s.maxTimer = null;
    s.tick = null;
  }, []);

  const finish = useCallback(
    (reason: "release" | "cancel" | "max") => {
      const s = session.current;
      if (!s) return;
      if (!s.recorder) {
        // Let go before the microphone was ready: nothing was recorded.
        s.released = true;
        s.discard = true;
        return;
      }
      const took = opts.current.now() - s.startedAt;
      if (reason === "cancel" || armed.current) {
        s.discard = true;
        setNotice("cancelled");
      } else if (reason === "release" && took < opts.current.minMs) {
        s.discard = true;
        setNotice("too-short");
      } else if (reason === "max") {
        setNotice("max-length");
      }
      teardown(s);
      if (s.recorder.state !== "inactive") s.recorder.stop();
      session.current = null;
      armed.current = false;
      setPhase("idle");
      setElapsedMs(0);
    },
    [teardown],
  );

  const start = useCallback(() => {
    if (session.current) return;
    const s: Session = { released: false, discard: false, startedAt: 0, recorder: null, stream: null, maxTimer: null, tick: null };
    session.current = s;
    armed.current = false;
    setNotice(null);
    setPhase("starting");
    const { getStream: get, createRecorder: make, now: clock, maxMs: max } = opts.current;
    get().then(
      (stream) => {
        s.stream = stream;
        if (s.released) {
          stream.getTracks().forEach((t) => t.stop());
          if (session.current === s) session.current = null;
          setPhase("idle");
          setNotice("too-short");
          return;
        }
        const mimeType = pickMimeType();
        const recorder = make(stream, mimeType);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (s.discard) return;
          const type = mimeType ?? recorder.mimeType ?? "audio/webm";
          deliver.current(new Blob(chunks, { type }), type);
        };
        s.recorder = recorder;
        recorder.start();
        s.startedAt = clock();
        s.tick = setInterval(() => setElapsedMs(opts.current.now() - s.startedAt), 200);
        s.maxTimer = setTimeout(() => finish("max"), max);
        setPhase("recording");
      },
      () => {
        if (session.current === s) session.current = null;
        setPhase("idle");
        setNotice("error");
      },
    );
  }, [finish]);

  // Unmounted mid-hold: stop the microphone and drop the clip.
  useEffect(
    () => () => {
      const s = session.current;
      if (!s) return;
      s.discard = true;
      s.released = true;
      teardown(s);
      if (s.recorder && s.recorder.state !== "inactive") s.recorder.stop();
      s.stream?.getTracks().forEach((t) => t.stop());
    },
    [teardown],
  );

  const bind = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      rect.current = e.currentTarget.getBoundingClientRect();
      start();
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const r = rect.current;
      if (!r || !session.current) return;
      const m = opts.current.cancelMargin;
      const off =
        e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m;
      if (off !== armed.current) {
        armed.current = off;
        if (session.current.recorder) setPhase(off ? "cancel-armed" : "recording");
      }
    },
    onPointerUp() {
      rect.current = null;
      finish("release");
    },
    onPointerCancel() {
      rect.current = null;
      finish("cancel");
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (e.key === "Escape" && session.current) {
        e.preventDefault();
        finish("cancel");
        return;
      }
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        start();
      }
    },
    onKeyUp(e: KeyboardEvent<HTMLElement>) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        finish("release");
      }
    },
    // A long press must not open the phone's context menu.
    onContextMenu(e: { preventDefault: () => void }) {
      e.preventDefault();
    },
  };

  return { phase, notice, elapsedMs, maxMs, bind, clearNotice: () => setNotice(null) };
}
