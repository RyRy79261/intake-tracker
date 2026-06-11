/**
 * Client-side encryption using Web Crypto API.
 * 
 * Uses AES-GCM for authenticated encryption with:
 * - PBKDF2 key derivation from user PIN/password
 * - Random IV for each encryption
 * - Authentication tag to detect tampering
 * 
 * SECURITY NOTES:
 * - This provides encryption-at-rest for browser storage
 * - Key is derived from user PIN - strength depends on PIN complexity
 * - Salt is stored alongside encrypted data (this is safe)
 * - For maximum security, use a strong password, not a short PIN
 */

// Configuration
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum

export interface EncryptedData {
  iv: string; // Base64 encoded
  salt: string; // Base64 encoded
  data: string; // Base64 encoded ciphertext
  version: number; // For future algorithm upgrades
}

/**
 * Check if Web Crypto API is available
 */
export function isCryptoAvailable(): boolean {
  return typeof window !== "undefined" && 
         window.crypto?.subtle !== undefined;
}

/**
 * Derive an encryption key from a PIN/password using PBKDF2
 */
async function deriveKey(
  pin: string, 
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  
  // Import PIN as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    pinData,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  
  // Derive AES key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data with a PIN-derived key
 */
export async function encrypt(
  plaintext: string, 
  pin: string
): Promise<EncryptedData> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Derive key from PIN
  const key = await deriveKey(pin, salt);
  
  // Encrypt with AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    data
  );
  
  // Encode to base64 for storage
  return {
    iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
    salt: btoa(String.fromCharCode.apply(null, Array.from(salt))),
    data: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(ciphertext)))),
    version: 1,
  };
}

/**
 * Decrypt data with a PIN-derived key
 */
export async function decrypt(
  encrypted: EncryptedData, 
  pin: string
): Promise<string> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }

  // Decode from base64
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
  const salt = Uint8Array.from(atob(encrypted.salt), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.data), c => c.charCodeAt(0));
  
  // Derive key from PIN
  const key = await deriveKey(pin, salt);
  
  try {
    // Decrypt with AES-GCM
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch {
    throw new Error("Decryption failed - incorrect PIN or corrupted data");
  }
}

/**
 * Hash a PIN for verification (not for encryption)
 * Used to verify PIN without storing it
 */
export async function hashPin(pin: string, salt?: Uint8Array): Promise<{
  hash: string;
  salt: string;
}> {
  if (!isCryptoAvailable()) {
    throw new Error("Web Crypto API not available");
  }

  const useSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    pinData,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  const hashBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: useSalt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  
  return {
    hash: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(hashBits)))),
    salt: btoa(String.fromCharCode.apply(null, Array.from(useSalt))),
  };
}

/**
 * Verify a PIN against a stored hash
 */
export async function verifyPin(
  pin: string, 
  storedHash: string, 
  storedSalt: string
): Promise<boolean> {
  const salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
  const { hash } = await hashPin(pin, salt);
  return hash === storedHash;
}

/**
 * Generate a cryptographically secure random ID
 */
export function generateSecureId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
