/**
 * Shared validation and step helpers for numeric settings inputs.
 */

/** Validate a numeric input string and save it, or revert to the default. */
export function validateAndSave(
  inputValue: string,
  min: number,
  max: number,
  defaultValue: number,
  setter: (value: number) => void,
  inputSetter: (value: string) => void
) {
  const parsed = parseInt(inputValue, 10);
  if (!isNaN(parsed) && parsed >= min && parsed <= max) {
    setter(parsed);
    inputSetter(parsed.toString());
  } else {
    inputSetter(defaultValue.toString());
  }
}

/** Increment a value by step, clamped to max. */
export function incrementSetting(
  currentValue: number,
  step: number,
  max: number,
  setter: (value: number) => void,
  inputSetter: (value: string) => void
) {
  const newValue = Math.min(currentValue + step, max);
  setter(newValue);
  inputSetter(newValue.toString());
}

/** Decrement a value by step, clamped to min. */
export function decrementSetting(
  currentValue: number,
  step: number,
  min: number,
  setter: (value: number) => void,
  inputSetter: (value: string) => void
) {
  const newValue = Math.max(currentValue - step, min);
  setter(newValue);
  inputSetter(newValue.toString());
}

/** Format an hour number (0-23) to a human-readable string. */
export function formatHour(hour: number): string {
  if (hour === 0) return "12:00 AM (midnight)";
  if (hour === 12) return "12:00 PM (noon)";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}
