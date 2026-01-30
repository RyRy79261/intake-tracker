/**
 * Security utilities for the Intake Tracker app.
 * 
 * SECURITY NOTES:
 * - This app stores health data locally on the device using IndexedDB
 * - API keys are stored in localStorage (browser-level storage)
 * - For maximum security, consider using a password manager for API keys
 *   and only entering them when needed, rather than persisting them
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
    // Simple XOR obfuscation - NOT cryptographically secure
    // This just prevents the key from being visible in plain text in storage
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
  if (!obfuscated.startsWith('obf:')) return obfuscated; // Legacy plain text
  
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
export function sanitizeNumericInput(value: string | number, min = 0, max = 100000): number {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(num) || !isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
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

// Data minimization helper for Perplexity API
// Strips any potentially sensitive info before sending to AI
export function sanitizeForAI(input: string): string {
  // Remove potential PII patterns (emails, phone numbers, etc.)
  return input
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[ssn]')
    .trim()
    .slice(0, 500); // Limit input length
}
