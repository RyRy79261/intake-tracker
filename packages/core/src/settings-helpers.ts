/**
 * Shared validation and step helpers for numeric settings inputs.
 */

/**
 * Validate a numeric input string and save it.
 *
 * Out-of-range numbers are clamped to [min, max] and saved; non-numeric input
 * keeps `defaultValue` (the current value). Returns a message for the field to
 * show inline, or null when the input was saved as typed.
 *
 * Pass `readStored` to show what the store actually kept: setters may round
 * (1000.4 → 1000), and when that equals the old value the store doesn't
 * change, so nothing else would overwrite the typed text.
 */
export function validateAndSave(
  inputValue: string,
  min: number,
  max: number,
  defaultValue: number,
  setter: (value: number) => void,
  inputSetter: (value: string) => void,
  readStored?: () => number
): string | null {
  // Use Number() (not parseFloat) so partial inputs like "12abc" or "1e2foo"
  // are rejected — parseFloat would accept the numeric prefix and silently save
  // the wrong value. Only fully numeric, non-empty input is persisted.
  const trimmed = inputValue.trim();
  const parsed = Number(trimmed);
  const show = (fallback: number) =>
    inputSetter((readStored ? readStored() : fallback).toString());

  if (trimmed === "" || !Number.isFinite(parsed)) {
    setter(defaultValue);
    show(defaultValue);
    return `Enter a number between ${min} and ${max}`;
  }

  const clamped = Math.min(max, Math.max(min, parsed));
  setter(clamped);
  show(clamped);
  return clamped === parsed
    ? null
    : `Must be between ${min} and ${max}, so ${clamped} was saved`;
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
