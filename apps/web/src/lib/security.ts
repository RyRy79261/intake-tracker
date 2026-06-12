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
 *
 * The pure input-sanitization / PII-redaction helpers moved to
 * @intake/core/security in Phase 3b and are re-exported below so existing
 * `@/lib/security` importers resolve unchanged. The functions kept here depend
 * on browser globals (btoa/atob, window, localStorage).
 */

export {
  sanitizeNumericInput,
  sanitizeTextInput,
  sanitizeForAI,
  sanitizeReportText,
} from "@intake/core/security";

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
