/**
 * Hook for field-level encryption using Web Crypto API primitives.
 *
 * Wraps the encrypt/decrypt functions from crypto.ts for use in React components.
 * This is a foundation hook -- it is NOT wired to any Dexie tables in this phase.
 *
 * Future usage pattern:
 * ```tsx
 * function SensitiveFieldEditor({ record }: { record: SomeRecord }) {
 *   const { encryptField, decryptField, isAvailable } = useEncryptedField();
 *   const pin = usePinFromContext(); // however PIN is obtained
 *
 *   // To encrypt before saving:
 *   const encrypted = await encryptField(record.sensitiveValue, pin);
 *   await db.someTable.update(record.id, { sensitiveValue: encrypted });
 *
 *   // To decrypt for display:
 *   const plaintext = await decryptField(record.sensitiveValue as EncryptedData, pin);
 * }
 * ```
 */

import { useMemo } from "react";
import {
  encrypt,
  decrypt,
  isCryptoAvailable,
  type EncryptedData,
} from "@/lib/crypto";

export interface UseEncryptedFieldReturn {
  /** Encrypt a plaintext string using PIN-derived key (AES-GCM + PBKDF2) */
  encryptField: (value: string, pin: string) => Promise<EncryptedData>;
  /** Decrypt an EncryptedData object back to plaintext using the same PIN */
  decryptField: (encrypted: EncryptedData, pin: string) => Promise<string>;
  /** Whether the Web Crypto API is available in the current environment */
  isAvailable: boolean;
}

/**
 * Provides field-level encryption/decryption capabilities.
 *
 * Uses AES-GCM with PBKDF2 key derivation from user PIN.
 * Each encryption produces a unique IV and salt, so encrypting the
 * same value twice produces different ciphertext.
 */
export function useEncryptedField(): UseEncryptedFieldReturn {
  return useMemo(
    () => ({
      encryptField: encrypt,
      decryptField: decrypt,
      isAvailable: isCryptoAvailable(),
    }),
    []
  );
}
