/**
 * Symmetric encryption for user-supplied API keys.
 *
 * Server-only. Never import from browser bundles.
 *
 * Blob format (versioned for future KMS swap):
 *   v1:<iv-base64>:<tag-base64>:<ct-base64>   — AES-256-GCM, env-var key
 *   v2:<...>                                  — reserved for KMS envelope
 *
 * AAD ("additional authenticated data") binds a blob to its owning user +
 * provider, so swapping a row from one user to another (or one provider to
 * another) within the database fails to decrypt rather than silently
 * succeeding.
 *
 * Trust model:
 *   - Master secret lives in API_KEY_ENCRYPTION_SECRET (hosting provider
 *     secret manager, not the database).
 *   - Compromise of Neon alone reveals only ciphertext.
 *   - Compromise of the hosting platform exposes everything; mitigate later
 *     by moving to KMS (v2 branch in decrypt).
 *
 * Rotation:
 *   - There is no automatic re-encryption. Rotating
 *     API_KEY_ENCRYPTION_SECRET invalidates every stored key — users
 *     re-enter. Acceptable for this app's scale.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32; // AES-256

function loadMasterKey(): Buffer {
  const raw = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!raw) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET is not set — cannot encrypt or decrypt user API keys",
    );
  }

  // Accept base64 or hex; both are common ways to express 32 random bytes.
  let buf: Buffer;
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "base64");
  }

  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `API_KEY_ENCRYPTION_SECRET must decode to ${KEY_BYTES} bytes (got ${buf.length}). ` +
        `Generate with: openssl rand -base64 32`,
    );
  }
  return buf;
}

export interface KeyVaultAad {
  userId: string;
  provider: "anthropic" | "groq";
}

function aadBytes({ userId, provider }: KeyVaultAad): Buffer {
  return Buffer.from(`${userId}:${provider}`, "utf8");
}

export function encryptKey(plaintext: string, aad: KeyVaultAad): string {
  if (!plaintext) throw new Error("Cannot encrypt empty plaintext");
  const key = loadMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aadBytes(aad));
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptKey(blob: string, aad: KeyVaultAad): string {
  if (!blob) throw new Error("Cannot decrypt empty blob");

  if (blob.startsWith("v1:")) {
    const [, ivB64, tagB64, ctB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !ctB64) {
      throw new Error("Malformed v1 blob");
    }
    const key = loadMasterKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aadBytes(aad));
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  }

  if (blob.startsWith("v2:")) {
    throw new Error("v2 (KMS) decryption not yet implemented");
  }

  throw new Error("Unknown key blob version");
}

/**
 * Pull the last 4 characters for UI display (e.g. "••••••AB12"). Never
 * returns more than 4 characters; callers should never store more.
 */
export function lastFourOf(plaintext: string): string {
  if (!plaintext) return "";
  return plaintext.slice(-4);
}
