/**
 * Date/time utility functions shared across components.
 */

/**
 * Get current datetime in local format for HTML datetime-local inputs.
 * Returns a string like "2024-01-15T14:30"
 */
export function getCurrentDateTimeLocal(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

/**
 * Convert a timestamp to datetime-local input format.
 * Useful for pre-filling datetime inputs with existing record timestamps.
 */
export function timestampToDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

/**
 * Convert a datetime-local input value to a Unix timestamp.
 * @param value - A string in "YYYY-MM-DDTHH:mm" format (from HTML datetime-local input)
 * @returns Unix timestamp in milliseconds
 * @throws Error if the value cannot be parsed as a valid date
 */
export function dateTimeLocalToTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  if (isNaN(timestamp)) {
    throw new Error(`Invalid date value: "${value}"`);
  }
  return timestamp;
}

/**
 * Format a timestamp as time only (e.g., "2:30 PM").
 * Used for compact displays where date isn't needed.
 */
export function formatTimeOnly(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a timestamp with date and time (e.g., "Jan 15, 2:30 PM").
 * Used for displays showing recent records across days.
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
