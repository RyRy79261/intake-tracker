// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// Drive the recorder by hand: the real one needs getUserMedia + MediaRecorder.
const clip = { blob: new Blob(["audio"], { type: "audio/webm" }), mimeType: "audio/webm" };
const recorder = {
  state: "recording" as const,
  error: null,
  level: 0.5,
  start: vi.fn(async () => ({ ok: true })),
  stop: vi.fn(async () => clip),
  cancel: vi.fn(),
};
vi.mock("@/hooks/use-hold-recorder", () => ({
  useHoldRecorder: () => recorder,
}));

const toast = vi.fn();
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

// The review UI is the existing VoicePanel; stub it to see what it was handed.
vi.mock("@/components/voice/voice-panel", () => ({
  VoicePanel: ({ initialClip }: { initialClip?: { mimeType: string } | null }) => (
    <div data-testid="voice-panel">clip:{initialClip?.mimeType ?? "none"}</div>
  ),
}));

import { HoldToTalk, HOLD_MIN_MS, HOLD_CANCEL_DISTANCE_PX } from "@/components/shell/hold-to-talk";

let now = 1_000_000;

function micButton() {
  return screen.getByRole("button", { name: "Hold to talk to the AI logger" });
}

describe("HoldToTalk", () => {
  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    recorder.start.mockClear();
    recorder.stop.mockClear();
    recorder.cancel.mockClear();
    toast.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a press-and-hold target: no touch scrolling, no callout", () => {
    render(<HoldToTalk />);
    const btn = micButton();
    expect(btn.className).toContain("touch-none");
    expect(btn.className).toContain("[-webkit-touch-callout:none]");
    expect(btn.className).toContain("select-none");
  });

  it("starts recording on pointer down and sends the clip on pointer up", async () => {
    render(<HoldToTalk />);
    const btn = micButton();

    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    expect(recorder.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("hold-to-talk-listening")).toBeInTheDocument();
    expect(screen.getByText("Release to review · Slide away to cancel")).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "true");

    now += HOLD_MIN_MS + 500;
    await act(async () => {
      fireEvent.pointerUp(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(recorder.cancel).not.toHaveBeenCalled();
    expect(screen.queryByTestId("hold-to-talk-listening")).not.toBeInTheDocument();
    // The existing VoicePanel receives the recorded clip for review.
    await waitFor(() => expect(screen.getByTestId("voice-panel")).toHaveTextContent("clip:audio/webm"));
  });

  it("announces state changes but not the ticking timer", () => {
    render(<HoldToTalk />);
    fireEvent.pointerDown(micButton(), { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    const panel = screen.getByTestId("hold-to-talk-listening");
    expect(panel).not.toHaveAttribute("aria-live");
    const timer = screen.getByTestId("hold-to-talk-timer");
    expect(timer.closest("[aria-live]")).toBeNull();
    expect(timer).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Release to review · Slide away to cancel")).toHaveAttribute("aria-live", "polite");
  });

  it("cancels when the finger slides away before release", async () => {
    render(<HoldToTalk />);
    const btn = micButton();

    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 100, clientY: 800 - HOLD_CANCEL_DISTANCE_PX - 10 });
    expect(screen.getByTestId("hold-to-talk-listening")).toHaveAttribute("data-cancelling", "true");
    expect(screen.getByText("Release to cancel · nothing will be logged")).toBeInTheDocument();

    now += 2000;
    await act(async () => {
      fireEvent.pointerUp(btn, { button: 0, pointerId: 1 });
    });

    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ title: "Cancelled · nothing logged" });
    expect(screen.queryByTestId("voice-panel")).not.toBeInTheDocument();
  });

  it("sliding back inside the radius un-cancels", async () => {
    render(<HoldToTalk />);
    const btn = micButton();
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 300, clientY: 800 });
    fireEvent.pointerMove(btn, { pointerId: 1, clientX: 110, clientY: 800 });
    expect(screen.getByTestId("hold-to-talk-listening")).not.toHaveAttribute("data-cancelling");

    now += 1000;
    await act(async () => {
      fireEvent.pointerUp(btn, { button: 0, pointerId: 1 });
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("treats a pointer cancel (e.g. the OS took the gesture) as cancel", async () => {
    render(<HoldToTalk />);
    const btn = micButton();
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    now += 1000;
    await act(async () => {
      fireEvent.pointerCancel(btn, { pointerId: 1 });
    });
    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it("a quick tap shows how to use it instead of recording", async () => {
    render(<HoldToTalk />);
    const btn = micButton();
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    now += HOLD_MIN_MS - 100;
    await act(async () => {
      fireEvent.pointerUp(btn, { button: 0, pointerId: 1 });
    });
    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(screen.getByText(/Press and hold to talk/)).toBeInTheDocument();
  });

  it("ignores secondary buttons", () => {
    render(<HoldToTalk />);
    fireEvent.pointerDown(micButton(), { button: 2, pointerId: 1 });
    expect(recorder.start).not.toHaveBeenCalled();
  });

  it("works from the keyboard: hold Space to talk, release to send", async () => {
    render(<HoldToTalk />);
    const btn = micButton();
    fireEvent.keyDown(btn, { key: " " });
    expect(recorder.start).toHaveBeenCalledTimes(1);
    now += 1000;
    await act(async () => {
      fireEvent.keyUp(btn, { key: " " });
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("drops the listening panel and explains when the microphone fails", async () => {
    recorder.start.mockResolvedValueOnce({ ok: false, error: "Microphone permission denied" } as never);
    render(<HoldToTalk />);
    await act(async () => {
      fireEvent.pointerDown(micButton(), { button: 0, pointerId: 1, clientX: 1, clientY: 1 });
    });
    expect(screen.queryByTestId("hold-to-talk-listening")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Microphone unavailable", description: "Microphone permission denied" }),
    );
  });

  it("corner (desktop desk band): a square button named Hold to talk, with its panel above the band on the right", () => {
    render(<HoldToTalk variant="corner" />);
    const btn = screen.getByRole("button", { name: "Hold to talk" });
    expect(btn).toHaveClass("h-14", "w-14");
    expect(btn).toHaveAttribute("title", "Hold to talk");

    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 1400, clientY: 870 });
    const panel = screen.getByTestId("hold-to-talk-listening").parentElement as HTMLElement;
    expect(panel).toHaveClass("right-1.5", "w-[400px]");
    // 72px desk band + 8px (jsdom folds the sum).
    expect(panel.style.bottom).toContain("80px");
  });

  it("cell (bottom bar): the panel sits just above the bar", () => {
    render(<HoldToTalk />);
    const btn = micButton();
    expect(btn).toHaveClass("min-h-11", "flex-col");
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 100, clientY: 800 });
    const panel = screen.getByTestId("hold-to-talk-listening").parentElement as HTMLElement;
    expect(panel).toHaveClass("inset-x-2");
    // 56px bottom bar + 8px.
    expect(panel.style.bottom).toContain("64px");
  });
});
