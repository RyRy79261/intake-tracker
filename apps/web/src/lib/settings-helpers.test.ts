import { describe, it, expect, vi } from "vitest";
import {
  validateAndSave,
  incrementSetting,
  decrementSetting,
  formatHour,
} from "@intake/core/settings";

describe("validateAndSave", () => {
  it("saves a valid in-range value", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    validateAndSave("50", 0, 100, 10, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(50);
    expect(inputSetter).toHaveBeenCalledWith("50");
  });

  it("reverts to default for non-numeric input", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    validateAndSave("abc", 0, 100, 10, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(10);
    expect(inputSetter).toHaveBeenCalledWith("10");
  });

  it("rejects partial-numeric input instead of saving the prefix", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    validateAndSave("12abc", 0, 100, 10, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(10);
    expect(inputSetter).toHaveBeenCalledWith("10");
  });

  it("clamps a value below min to min and says so", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    const message = validateAndSave("-5", 0, 100, 10, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(0);
    expect(inputSetter).toHaveBeenCalledWith("0");
    expect(message).toMatch(/0.*100/);
  });

  it("clamps a value above max to max and says so", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    const message = validateAndSave("15000", 100, 10000, 1000, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(10000);
    expect(inputSetter).toHaveBeenCalledWith("10000");
    expect(message).toMatch(/100.*10000/);
  });

  it("explains a rejected non-numeric input", () => {
    expect(validateAndSave("abc", 0, 100, 10, vi.fn(), vi.fn())).toMatch(
      /number/i,
    );
  });

  it("returns no message for a valid value", () => {
    expect(validateAndSave("50", 0, 100, 10, vi.fn(), vi.fn())).toBeNull();
  });

  it("shows the stored value when the setter normalises the input", () => {
    // The store rounds to an integer; 1000.4 is stored as 1000, so the
    // field must read 1000, not the never-saved "1000.4".
    let stored = 1000;
    const setter = (v: number) => {
      stored = Math.round(v);
    };
    const inputSetter = vi.fn();
    validateAndSave("1000.4", 100, 10000, stored, setter, inputSetter, () => stored);
    expect(inputSetter).toHaveBeenLastCalledWith("1000");
  });

  it("accepts the min and max boundaries", () => {
    const minSetter = vi.fn();
    validateAndSave("0", 0, 100, 10, minSetter, vi.fn());
    expect(minSetter).toHaveBeenCalledWith(0);

    const maxSetter = vi.fn();
    validateAndSave("100", 0, 100, 10, maxSetter, vi.fn());
    expect(maxSetter).toHaveBeenCalledWith(100);
  });
});

describe("incrementSetting", () => {
  it("adds the step to the current value", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    incrementSetting(10, 5, 100, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(15);
    expect(inputSetter).toHaveBeenCalledWith("15");
  });

  it("clamps the result to max", () => {
    const setter = vi.fn();
    incrementSetting(98, 5, 100, setter, vi.fn());
    expect(setter).toHaveBeenCalledWith(100);
  });
});

describe("decrementSetting", () => {
  it("subtracts the step from the current value", () => {
    const setter = vi.fn();
    const inputSetter = vi.fn();
    decrementSetting(10, 3, 0, setter, inputSetter);
    expect(setter).toHaveBeenCalledWith(7);
    expect(inputSetter).toHaveBeenCalledWith("7");
  });

  it("clamps the result to min", () => {
    const setter = vi.fn();
    decrementSetting(2, 5, 0, setter, vi.fn());
    expect(setter).toHaveBeenCalledWith(0);
  });
});

describe("formatHour", () => {
  it("labels midnight", () => {
    expect(formatHour(0)).toBe("12:00 AM (midnight)");
  });

  it("labels noon", () => {
    expect(formatHour(12)).toBe("12:00 PM (noon)");
  });

  it("formats morning hours as AM", () => {
    expect(formatHour(9)).toBe("9:00 AM");
  });

  it("formats afternoon hours as PM", () => {
    expect(formatHour(15)).toBe("3:00 PM");
  });

  it("formats the 11 PM boundary", () => {
    expect(formatHour(23)).toBe("11:00 PM");
  });
});
