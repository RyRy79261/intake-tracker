import { describe, it, expect } from "vitest";
import {
  createShakeDetector,
  type ShakeDetectorConfig,
  type ShakeSample,
} from "@/hooks/use-shake-gesture";

const BASE: ShakeDetectorConfig = {
  threshold: 8,
  requiredJolts: 3,
  windowMs: 800,
  cooldownMs: 3000,
};

/**
 * Feed the detector an alternating sample at each timestamp. Samples alternate
 * between magnitude 0 and magnitude `delta` on the x-axis, so every transition
 * changes the acceleration magnitude by `delta` and registers a jolt when that
 * exceeds the threshold. Returns the timestamps at which a shake was detected.
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

  it("ignores reorientation that keeps total acceleration constant", () => {
    // Gravity (~9.8 m/s²) redistributing across the axes as the device is
    // tilted: every sample has the same magnitude but different per-axis
    // values. A per-axis delta would read this as a violent shake; the
    // magnitude-based detector correctly sees no movement.
    const detector = createShakeDetector({ ...BASE, threshold: 4 });
    const G = 9.8;
    const D = G / Math.SQRT2; // ~6.93 — keeps magnitude at G
    const rotations: ShakeSample[] = [
      { x: G, y: 0, z: 0 },
      { x: 0, y: G, z: 0 },
      { x: 0, y: 0, z: G },
      { x: D, y: D, z: 0 },
      { x: 0, y: D, z: D },
      { x: D, y: 0, z: D },
    ];
    let fired = false;
    rotations.forEach((sample, i) => {
      if (detector.process(sample, i * 60)) fired = true;
    });
    expect(fired).toBe(false);
  });
});
