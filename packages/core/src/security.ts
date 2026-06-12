/**
 * Pure input-sanitization and PII-redaction helpers.
 *
 * Moved out of apps/web/src/lib/security.ts (Phase 3b). The browser-dependent
 * helpers — obfuscate/deobfuscate (btoa/atob), isSecureContext and
 * getSecurityWarnings (window/localStorage) — stay in the app; only the pure,
 * I/O-free functions live here.
 */

// Validate and sanitize numeric input
// When precision is provided, rounds to that many decimal places (e.g., precision=2 for 0.05 steps).
// Without precision, rounds to integer (backward-compatible with all existing callers).
export function sanitizeNumericInput(value: string | number, min = 0, max = 100000, precision?: number): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || !isFinite(num)) return min;
  const clamped = Math.max(min, Math.min(max, num));
  if (precision !== undefined) {
    const factor = Math.pow(10, precision);
    return Math.round(clamped * factor) / factor;
  }
  return Math.round(clamped);
}

// Sanitize text input to prevent injection
export function sanitizeTextInput(text: string, maxLength = 500): string {
  if (!text || typeof text !== 'string') return '';
  // Remove any HTML tags and limit length
  return text
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength);
}

// Strip potential PII patterns from a string. Shared by sanitizeForAI and
// sanitizeReportText. Does NOT trim or length-limit — callers do that.
function redactPii(input: string): string {
  return input
    // Email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
    // International phone numbers: +27 12 345 6789, +49-123-4567890, etc.
    .replace(/\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,10}/g, '[phone]')
    // US phone numbers: 123-456-7890, 123.456.7890
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]')
    // SSN: 123-45-6789
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[ssn]')
    // Credit card numbers: 1234 5678 9012 3456 or 1234-5678-9012-3456
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[card]')
    // Date of birth patterns: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[date]')
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '[date]')
    // South African ID number: 13 consecutive digits
    .replace(/\b\d{13}\b/g, '[id-number]');
}

// Data minimization helper for AI API
// Strips any potentially sensitive info before sending to AI
export function sanitizeForAI(input: string): string {
  return redactPii(input)
    .trim()
    .slice(0, 500); // Limit input length
}

// Sanitize multi-line text (descriptions, error logs, environment dumps) for
// inclusion in a bug report. Same PII redaction as sanitizeForAI, but keeps
// newlines and allows a larger length budget — the 500-char cap on
// sanitizeForAI is too small for stack traces and log excerpts.
export function sanitizeReportText(input: string, maxLength = 8000): string {
  if (!input || typeof input !== 'string') return '';
  return redactPii(input).trim().slice(0, maxLength);
}
