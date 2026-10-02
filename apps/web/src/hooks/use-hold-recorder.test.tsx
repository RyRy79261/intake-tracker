// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/components/voice/voice-recorder", () => ({
  pickMimeType: () => "audio/webm",
}));

import { useHoldRecorder } from "@/hooks/use-hold-recorder";

interface FakeStream {
  track: { stop: ReturnType<typeof vi.fn> };
  getTracks: () => Array<{ stop: ReturnType<typeof vi.fn> }>;
}

function fakeStream(): FakeStream {
  const track = { stop: vi.fn() };
  return { track, getTracks: () => [track] };
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: FakeStream) {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

/** getUserMedia calls that the test resolves by hand (the open permission prompt). */
let pending: Array<(s: FakeStream) => void> = [];

beforeEach(() => {
  pending = [];
  FakeRecorder.instances = [];
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(() => new Promise<FakeStream>((resolve) => pending.push(resolve))),
    },
  });
  // No level meter in these tests.
  vi.stubGlobal("AudioContext", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHoldRecorder", () => {
  it("records and hands back a clip", async () => {
    const { result } = renderHook(() => useHoldRecorder());
    let started!: Promise<{ ok: boolean }>;
    act(() => {
      started = result.current.start();
    });
    const stream = fakeStream();
    await act(async () => {
      pending[0]!(stream);
      await started;
    });
    expect(result.current.state).toBe("recording");
    let clip: unknown;
    await act(async () => {
      clip = await result.current.stop();
    });
    expect(clip).toMatchObject({ mimeType: "audio/webm" });
    expect(stream.track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("stops the stream of a request cancelled while the prompt was open, even after a new start", async () => {
    const { result } = renderHook(() => useHoldRecorder());
    let first!: Promise<{ ok: boolean }>;
    let second!: Promise<{ ok: boolean }>;
    act(() => {
      first = result.current.start();
    });
    act(() => {
      result.current.cancel();
    });
    act(() => {
      second = result.current.start();
    });
    expect(pending).toHaveLength(2);

    const stale = fakeStream();
    const live = fakeStream();
    await act(async () => {
      pending[0]!(stale);
      pending[1]!(live);
      await Promise.all([first, second]);
    });

    await expect(first).resolves.toEqual({ ok: false });
    await expect(second).resolves.toEqual({ ok: true });
    // The cancelled request never recorded and released its microphone.
    expect(stale.track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(FakeRecorder.instances[0]!.stream).toBe(live);
    expect(live.track.stop).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.stop();
    });
    expect(live.track.stop).toHaveBeenCalled();
  });

  it("stops a stream that arrives after unmount", async () => {
    const { result, unmount } = renderHook(() => useHoldRecorder());
    let started!: Promise<{ ok: boolean }>;
    act(() => {
      started = result.current.start();
    });
    unmount();
    const stream = fakeStream();
    await act(async () => {
      pending[0]!(stream);
      await started;
    });
    await expect(started).resolves.toEqual({ ok: false });
    expect(stream.track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
  });
});
