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

// Sanitize text input to prevent injection.
export function sanitizeTextInput(text: string, maxLength = 500): string {
  if (!text || typeof text !== 'string') return '';
  // Strip markup with a single linear left-to-right scan: copy text up to each
  // '<', then jump past the matching '>' (or, if there is none, drop the rest).
  // This is O(n) with no regex backtracking — unlike `replace(/<[^>]*>/g, '')`,
  // which backtracks quadratically on inputs like "<<<<…" (ReDoS) and leaves
  // unterminated tags such as "<script" behind (incomplete sanitization). Here
  // no tag, closed or unclosed, can survive. (Resolves CodeQL js/polynomial-redos
  // and js/incomplete-multi-character-sanitization on this function.)
  let out = '';
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);
    const gt = text.indexOf('>', lt + 1);
    if (gt === -1) break; // unterminated tag — drop the remainder
    i = gt + 1;
  }
  return out.trim().slice(0, maxLength);
}

// ─── South African ID vs EAN-13 barcode ─────────────────────────────────
// Both are 13 digits, so a bare 13-digit run is ambiguous. An SA ID is
// YYMMDD SSSS C A Z: a real birth date, a citizenship digit of 0-2 and a
// Luhn check digit. Anything that can't be one is left alone when it reads
// as a barcode (a valid EAN-13 check digit, or labelled "barcode"/"EAN"/
// "UPC"/"GTIN" just before it), so branded-food lookups keep their exact
// product code. Everything else is redacted — privacy wins a tie.

const MAX_DAY_BY_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function couldBeSaId(digits: string): boolean {
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const citizenship = digits[10];
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > (MAX_DAY_BY_MONTH[month - 1] ?? 31)) return false;
  if (citizenship !== '0' && citizenship !== '1' && citizenship !== '2') return false;
  return luhnValid(digits);
}

function eanValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

const BARCODE_LABEL = /\b(?:barcode|bar code|ean(?:-13)?|upc|gtin)\W{0,3}$/i;

function redactThirteenDigits(match: string, offset: number, whole: string): string {
  if (couldBeSaId(match)) return '[id-number]';
  const before = whole.slice(Math.max(0, offset - 16), offset);
  if (eanValid(match) || BARCODE_LABEL.test(before)) return match;
  return '[id-number]';
}

// Strip likely PII patterns from a string. Shared by sanitizeForAI and
// sanitizeReportText. Does NOT trim or length-limit — callers do that.
//
// BEST-EFFORT ONLY. This is regex redaction of well-formed identifiers
// (emails, phone/card/ID numbers, dates). It does not and cannot catch free
// text such as names or street addresses ("John Smith, 12 Main St" passes
// through unchanged), so it narrows what reaches the AI provider rather
// than guaranteeing nothing personal does.
function redactPii(input: string): string {
  return input
    // Email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
    // South African ID written in groups: 800101 5009 087, 800101-5009-087.
    // The grouping itself marks it as an ID, so no checksum is required.
    .replace(/\b\d{6}[ -]\d{4}[ -]?\d{3}\b|\b\d{10}[ -]\d{3}\b/g, '[id-number]')
    // International phone numbers: +27 12 345 6789, +49-123-4567890, etc.
    // At least 7 digits after the country code, so a quantity such as
    // "+12 300ml" or "+1 250 ml" is not taken for a number.
    .replace(/\+\d{1,3}(?:[-.\s]?\d){7,12}(?!\d)/g, '[phone]')
    // US phone numbers: 123-456-7890, 123.456.7890
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]')
    // SSN: 123-45-6789
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[ssn]')
    // Credit card numbers: 1234 5678 9012 3456 or 1234-5678-9012-3456
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[card]')
    // Date of birth patterns: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[date]')
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '[date]')
    // Bare 13-digit run: an SA ID unless it can only be a barcode.
    .replace(/\b\d{13}\b/g, redactThirteenDigits);
}

// Data minimization helper for AI API
// Strips any potentially sensitive info before sending to AI. `maxLength`
// defaults to 500 (short free-text fields); callers that legitimately carry
// more text — a dictated voice transcript — pass their own cap.
export function sanitizeForAI(input: string, maxLength = 500): string {
  return redactPii(input)
    .trim()
    .slice(0, maxLength); // Limit input length
}

// Sanitize multi-line text (descriptions, error logs, environment dumps) for
// inclusion in a bug report. Same PII redaction as sanitizeForAI, but keeps
// newlines and allows a larger length budget — the 500-char cap on
// sanitizeForAI is too small for stack traces and log excerpts.
export function sanitizeReportText(input: string, maxLength = 8000): string {
  if (!input || typeof input !== 'string') return '';
  return redactPii(input).trim().slice(0, maxLength);
}
