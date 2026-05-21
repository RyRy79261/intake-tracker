import { describe, it, expect } from "vitest";
import {
  createShakeDetector,
  type ShakeDetectorConfig,
  type ShakeSample,
} from "@/hooks/use-shake-gesture";

const BASE: ShakeDetectorConfig = {
  threshold: 15,
  requiredJolts: 3,
  windowMs: 800,
  cooldownMs: 3000,
};

/**
 * Feed the detector an alternating sample at each timestamp. Consecutive
 * samples differ by `delta` on the x-axis, so every transition registers a
 * jolt when `delta` exceeds the configured threshold. Returns the timestamps
 * at which a shake was detected.
 */
function run(
  config: ShakeDetectorConfig,
  times: number[],
  delta = 100,
): number[] {
  const detector = createShakeDetector(config);
  const triggers: number[] = [];
  times.forEach((t, i) => {
    const sample: ShakeSample = { x: i % 2 === 0 ? 0 : delta, y: 0, z: 0 };
    if (detector.process(sample, t)) triggers.push(t);
  });
  return triggers;
}

describe("createShakeDetector", () => {
  it("fires once enough jolts land within the window", () => {
    expect(run(BASE, [0, 60, 120, 180])).toEqual([180]);
  });

  it("does not fire when jolt deltas stay below the threshold", () => {
    // delta 100 < threshold 200 — no jolts register at all.
    expect(run({ ...BASE, threshold: 200 }, [0, 60, 120, 180], 100)).toEqual(
      [],
    );
    // Lowering the threshold below the same delta makes it fire — proving
    // the sensitivity setting changes behaviour.
    expect(run({ ...BASE, threshold: 50 }, [0, 60, 120, 180], 100)).toEqual([
      180,
    ]);
  });

  it("respects the required-jolts setting", () => {
    // Three jolts: fires at requiredJolts 3, silent at requiredJolts 5.
    expect(run({ ...BASE, requiredJolts: 3 }, [0, 60, 120, 180])).toEqual([
      180,
    ]);
    expect(run({ ...BASE, requiredJolts: 5 }, [0, 60, 120, 180])).toEqual([]);
    // Five jolts clears the higher bar.
    expect(
      run({ ...BASE, requiredJolts: 5 }, [0, 60, 120, 180, 240, 300]),
    ).toEqual([300]);
  });

  it("ignores jolts spaced beyond the rolling window", () => {
    // 500ms spacing with an 800ms window: at most two jolts ever coexist.
    expect(run(BASE, [0, 500, 1000, 1500, 2000])).toEqual([]);
  });

  it("enforces the cooldown between consecutive detections", () => {
    const triggers = run(BASE, [
      0, 60, 120, 180, // first shake -> fires at 180
      240, 300, 360, // within 3000ms cooldown -> suppressed
      3200, 3260, 3320, // cooldown elapsed -> fires again
    ]);
    expect(triggers).toEqual([180, 3320]);
  });
});
