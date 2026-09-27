// @vitest-environment jsdom
// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// Hold-to-talk: press starts, release sends, slide away cancels, a tap is
// discarded, the maximum length stops and sends by itself.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { useHoldToRecord } from "@/app/_prototype-os/use-hold-to-record";

class FakeRecorder {
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["clip"]) });
    this.onstop?.();
  }
}

const RECT = { left: 0, right: 100, top: 0, bottom: 50 } as DOMRect;

function pointer(clientX = 50, clientY = 25) {
  return {
    pointerType: "touch",
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    preventDefault() {},
    currentTarget: { setPointerCapture() {}, getBoundingClientRect: () => RECT },
  } as unknown as PointerEvent<HTMLElement>;
}

let clock = 0;
const stopTrack = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;

function setup(onRecorded = vi.fn()) {
  const hook = renderHook(() =>
    useHoldToRecord({
      onRecorded,
      maxMs: 10_000,
      minMs: 400,
      getStream: () => Promise.resolve(stream),
      createRecorder: () => new FakeRecorder() as unknown as MediaRecorder,
      now: () => clock,
    }),
  );
  return { hook, onRecorded };
}

async function press(hook: ReturnType<typeof setup>["hook"]) {
  await act(async () => {
    hook.result.current.bind.onPointerDown(pointer());
    await Promise.resolve();
  });
}

describe("useHoldToRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    stopTrack.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("records while held and sends the clip on release", async () => {
    const { hook, onRecorded } = setup();
    await press(hook);
    expect(hook.result.current.phase).toBe("recording");
    clock = 2_000;
    act(() => hook.result.current.bind.onPointerUp());
    expect(hook.result.current.phase).toBe("idle");
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(onRecorded.mock.calls[0]![1]).toBe("audio/webm");
    expect(stopTrack).toHaveBeenCalled();
  });

  it("treats a quick tap as too short and sends nothing", async () => {
    const { hook, onRecorded } = setup();
    await press(hook);
    clock = 150;
    act(() => hook.result.current.bind.onPointerUp());
    expect(onRecorded).not.toHaveBeenCalled();
    expect(hook.result.current.notice).toBe("too-short");
  });

  it("arms a cancel when the finger slides away, and releasing there discards", async () => {
    const { hook, onRecorded } = setup();
    await press(hook);
    clock = 2_000;
    act(() => hook.result.current.bind.onPointerMove(pointer(50, -200)));
    expect(hook.result.current.phase).toBe("cancel-armed");
    act(() => hook.result.current.bind.onPointerUp());
    expect(onRecorded).not.toHaveBeenCalled();
    expect(hook.result.current.notice).toBe("cancelled");
  });

  it("sliding back onto the button keeps the recording", async () => {
    const { hook, onRecorded } = setup();
    await press(hook);
    clock = 2_000;
    act(() => hook.result.current.bind.onPointerMove(pointer(50, -200)));
    act(() => hook.result.current.bind.onPointerMove(pointer(50, 25)));
    expect(hook.result.current.phase).toBe("recording");
    act(() => hook.result.current.bind.onPointerUp());
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("stops and sends by itself at the maximum length", async () => {
    const { hook, onRecorded } = setup();
    await press(hook);
    clock = 10_000;
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(hook.result.current.notice).toBe("max-length");
    expect(hook.result.current.phase).toBe("idle");
  });

  it("a system pointer cancel discards the clip", async () => {
    const { hook, onRecorded } = setup();
    await press(hook);
    clock = 2_000;
    act(() => hook.result.current.bind.onPointerCancel());
    expect(onRecorded).not.toHaveBeenCalled();
  });
});
