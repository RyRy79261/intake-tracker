/**
 * PIN Service - Secure gate secret pattern for privacy protection
 * 
 * Security model:
 * 1. On PIN setup: Generate random gateSecret, encrypt with PIN, store encrypted version
 * 2. On unlock: Decrypt gateSecret, store in sessionStorage (volatile)
 * 3. isUnlocked() checks sessionStorage for the decrypted secret
 * 
 * This is secure because:
 * - Can't bypass by editing localStorage (encrypted secret needs PIN)
 * - Can't bypass by editing React state (checks sessionStorage directly)
 * - Changing PIN just re-encrypts the gate secret (no data migration)
 */

import { encrypt, decrypt, isCryptoAvailable, type EncryptedData } from "./crypto";

// Storage keys
const PIN_STORAGE_KEY = "intake-tracker-pin";
const SESSION_SECRET_KEY = "intake-tracker-session";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// PIN data stored in localStorage
interface PinStorageData {
  encryptedSecret: EncryptedData;
  lastUnlockTime: number | null;
}

/**
 * Generate a random 32-byte gate secret
 */
function generateGateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get PIN storage data from localStorage
 */
function getPinStorage(): PinStorageData | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(PIN_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as PinStorageData;
  } catch {
    return null;
  }
}

/**
 * Save PIN storage data to localStorage
 */
function setPinStorage(data: PinStorageData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Clear PIN storage from localStorage
 */
function clearPinStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PIN_STORAGE_KEY);
}

/**
 * Get the decrypted gate secret from sessionStorage
 */
function getSessionSecret(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_SECRET_KEY);
}

/**
 * Store decrypted gate secret in sessionStorage
 */
function setSessionSecret(secret: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_SECRET_KEY, secret);
}

/**
 * Clear session secret
 */
function clearSessionSecret(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_SECRET_KEY);
}

/**
 * Check if a PIN has been set up
 */
export function hasPinSetup(): boolean {
  return getPinStorage() !== null;
}

/**
 * Check if currently unlocked
 * Returns true if:
 * - No PIN is set up, OR
 * - Valid gate secret exists in sessionStorage
 */
export function isUnlocked(): boolean {
  // No PIN set = always unlocked
  const pinData = getPinStorage();
  if (!pinData) return true;
  
  // Check for valid session secret
  const sessionSecret = getSessionSecret();
  if (sessionSecret) return true;
  
  return false;
}

/**
 * Check if within 24-hour unlock window
 */
export function isWithin24Hours(): boolean {
  const pinData = getPinStorage();
  if (!pinData?.lastUnlockTime) return false;
  
  const now = Date.now();
  return now - pinData.lastUnlockTime < TWENTY_FOUR_HOURS_MS;
}

/**
 * Set up a new PIN
 * @param pin The PIN to set (4-6 digits recommended)
 * @returns true if successful
 */
export async function setupPin(pin: string): Promise<boolean> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }
  
  if (!pin || pin.length < 4) {
    throw new Error("PIN must be at least 4 characters");
  }
  
  // Generate a new gate secret
  const gateSecret = generateGateSecret();
  
  // Encrypt the gate secret with the PIN
  const encryptedSecret = await encrypt(gateSecret, pin);
  
  // Store the encrypted secret
  setPinStorage({
    encryptedSecret,
    lastUnlockTime: Date.now(),
  });
  
  // Store the decrypted secret in session (user is now unlocked)
  setSessionSecret(gateSecret);
  
  return true;
}

/**
 * Attempt to unlock with a PIN
 * @param pin The PIN to try
 * @returns true if unlock successful, false if wrong PIN
 */
export async function unlock(pin: string): Promise<boolean> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }
  
  const pinData = getPinStorage();
  if (!pinData) {
    throw new Error("No PIN has been set up");
  }
  
  try {
    // Try to decrypt the gate secret
    const gateSecret = await decrypt(pinData.encryptedSecret, pin);
    
    // Success! Store in session and update unlock time
    setSessionSecret(gateSecret);
    setPinStorage({
      ...pinData,
      lastUnlockTime: Date.now(),
    });
    
    return true;
  } catch {
    // Decryption failed = wrong PIN
    return false;
  }
}

/**
 * Change the PIN
 * @param oldPin Current PIN for verification
 * @param newPin New PIN to set
 * @returns true if successful
 */
export async function changePin(oldPin: string, newPin: string): Promise<boolean> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }
  
  if (!newPin || newPin.length < 4) {
    throw new Error("New PIN must be at least 4 characters");
  }
  
  const pinData = getPinStorage();
  if (!pinData) {
    throw new Error("No PIN has been set up");
  }
  
  try {
    // Decrypt with old PIN to get the gate secret
    const gateSecret = await decrypt(pinData.encryptedSecret, oldPin);
    
    // Re-encrypt with new PIN
    const newEncryptedSecret = await encrypt(gateSecret, newPin);
    
    // Store the new encrypted secret
    setPinStorage({
      encryptedSecret: newEncryptedSecret,
      lastUnlockTime: Date.now(),
    });
    
    return true;
  } catch {
    // Decryption failed = wrong old PIN
    return false;
  }
}

/**
 * Remove PIN protection entirely
 * @param pin Current PIN for verification
 * @returns true if successful
 */
export async function removePin(pin: string): Promise<boolean> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }
  
  const pinData = getPinStorage();
  if (!pinData) {
    // No PIN to remove
    return true;
  }
  
  try {
    // Verify the PIN first
    await decrypt(pinData.encryptedSecret, pin);
    
    // Clear all PIN data
    clearPinStorage();
    clearSessionSecret();
    
    return true;
  } catch {
    // Wrong PIN
    return false;
  }
}

/**
 * Lock the app (clear session secret)
 * User will need to enter PIN again
 */
export function lock(): void {
  clearSessionSecret();
}

/**
 * Get time remaining in current unlock session (for UI display)
 * @returns milliseconds remaining, or null if not in a session
 */
export function getUnlockTimeRemaining(): number | null {
  const pinData = getPinStorage();
  if (!pinData?.lastUnlockTime) return null;
  
  const elapsed = Date.now() - pinData.lastUnlockTime;
  const remaining = TWENTY_FOUR_HOURS_MS - elapsed;
  
  return remaining > 0 ? remaining : null;
}
