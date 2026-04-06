/**
 * Security utilities for the Intake Tracker app.
 *
 * SECURITY NOTES:
 * - This app stores health data locally on the device using IndexedDB
 * - API keys are stored server-side only (never in client storage)
 *
 * LIMITATIONS:
 * - Browser storage (localStorage/IndexedDB) is NOT encrypted at rest
 * - Anyone with physical access to the device can access this data
 * - XSS attacks could potentially access stored data
 */

// Obfuscate API key in memory (NOT encryption, just basic obfuscation)
// This prevents casual inspection but NOT determined attackers
const OBFUSCATION_KEY = 'intake-tracker-v1';

export function obfuscateApiKey(key: string): string {
  if (!key) return '';
  try {
    const encoded = btoa(
      key
        .split('')
        .map((char, i) =>
          String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
        )
        .join('')
    );
    return `obf:${encoded}`;
  } catch {
    return key;
  }
}

export function deobfuscateApiKey(obfuscated: string): string {
  if (!obfuscated) return '';
  if (!obfuscated.startsWith('obf:')) return obfuscated;

  try {
    const encoded = obfuscated.slice(4);
    const decoded = atob(encoded);
    return decoded
      .split('')
      .map((char, i) =>
        String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
      )
      .join('');
  } catch {
    return '';
  }
}

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

// Check if we're in a secure context (HTTPS or localhost)
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return true;
  return window.isSecureContext ?? window.location.protocol === 'https:';
}

// Warn about security context
export function getSecurityWarnings(): string[] {
  const warnings: string[] = [];
  
  if (typeof window === 'undefined') return warnings;
  
  if (!isSecureContext()) {
    warnings.push('App is not running in a secure context (HTTPS). Data may be vulnerable to interception.');
  }
  
  // Check if localStorage is available (private browsing may disable it)
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
  } catch {
    warnings.push('Local storage is unavailable. Settings will not persist.');
  }
  
  return warnings;
}

// Data minimization helper for AI API
// Strips any potentially sensitive info before sending to AI
export function sanitizeForAI(input: string): string {
  // Remove potential PII patterns
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
    .replace(/\b\d{13}\b/g, '[id-number]')
    .trim()
    .slice(0, 500); // Limit input length
}
