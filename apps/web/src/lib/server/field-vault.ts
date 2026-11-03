/**
 * Field encryption at rest for synced health text. Server-only.
 *
 * The sync push route encrypts the fields listed in {@link ENCRYPTED_FIELDS}
 * before a row is written to Neon, and the pull route decrypts them before a
 * row leaves the server. Devices and the wire (HTTPS) see plain text; the
 * database holds only ciphertext, so a leak of Neon alone (a stolen backup, a
 * misused read-only connection string) reveals no journal text.
 *
 * What this does not protect against: anyone who controls the server (the
 * hosting platform, or code running with its environment) can decrypt, and
 * the server must, to serve a pull. It is encryption at rest, not end-to-end
 * encryption.
 *
 * Blob format: `f1:<iv-base64>:<tag-base64>:<ct-base64>`, AES-256-GCM with a
 * random 96-bit IV. The key is derived with HKDF-SHA256 from
 * API_KEY_ENCRYPTION_SECRET (the master secret lib/key-vault.ts already
 * uses), under its own `info` label, so the API-key ciphertext and the
 * field ciphertext never share a key. The AAD binds each blob to its user,
 * table, row and field: a ciphertext copied to another row, column or
 * account fails to decrypt instead of reading as that row's text.
 *
 * An empty string (a deleted entry's blanked content) is stored as it is.
 *
 * Rotation: there is none. Rotating API_KEY_ENCRYPTION_SECRET makes every
 * stored journal text unreadable on the server. Devices that already hold
 * the rows keep them; a newly signed-in device receives
 * {@link UNREADABLE_TEXT} in their place. Re-encrypt before rotating.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { TableName } from "@intake/db/sync-payload";
import { loadMasterKey } from "@/lib/key-vault";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const PREFIX = "f1:";
const HKDF_INFO = "intake-tracker field-vault v1";

/** The columns stored as ciphertext, per synced table. */
export const ENCRYPTED_FIELDS: Partial<Record<TableName, readonly string[]>> = {
  journalEntries: ["words", "finding"],
};

/** What a pull returns in place of a field that no longer decrypts. */
export const UNREADABLE_TEXT = {
  words: "This entry could not be decrypted on the server.",
  finding: "Unreadable entry",
} as const;

/**
 * What a deleted row keeps of these fields: nothing. The device blanks them
 * when it tombstones an entry (lib/synced-write.ts retireChanges); the push
 * route applies the same values to every tombstone it writes, so an older
 * client or a tombstone-only stub cannot leave content behind on the server.
 */
export const BLANK_WHEN_DELETED: Partial<Record<TableName, Readonly<Record<string, unknown>>>> = {
  journalEntries: { words: "", finding: "", places: [], severity: null },
};

let cachedKey: { secret: Buffer; key: Buffer } | null = null;

function fieldKey(): Buffer {
  const secret = loadMasterKey();
  if (cachedKey && cachedKey.secret.equals(secret)) return cachedKey.key;
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), HKDF_INFO, 32));
  cachedKey = { secret, key };
  return key;
}

interface FieldAad {
  userId: string;
  tableName: TableName;
  rowId: string;
  field: string;
}

const aadBytes = ({ userId, tableName, rowId, field }: FieldAad): Buffer =>
  Buffer.from(JSON.stringify([userId, tableName, rowId, field]), "utf8");

export function isFieldCiphertext(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptField(plaintext: string, aad: FieldAad): string {
  if (plaintext === "") return "";
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, fieldKey(), iv);
  cipher.setAAD(aadBytes(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** A stored field that does not decrypt: tampered, moved, or a rotated secret. */
export class FieldDecryptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FieldDecryptError";
  }
}

/**
 * Decrypt one stored value. A value without the `f1:` prefix is returned as
 * it is (an empty, blanked field).
 */
export function decryptField(stored: string, aad: FieldAad): string {
  if (!isFieldCiphertext(stored)) return stored;
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new FieldDecryptError("Malformed field blob");
  // Outside the try: a missing secret is a configuration error.
  const key = fieldKey();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAAD(aadBytes(aad));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch (cause) {
    throw new FieldDecryptError("Stored field could not be decrypted", { cause });
  }
}

type Row = Record<string, unknown> & { id?: unknown };

/** `row` with its table's encrypted fields as ciphertext. Other tables pass through. */
export function encryptRowFields<R extends Row>(tableName: TableName, row: R, userId: string): R {
  const fields = ENCRYPTED_FIELDS[tableName];
  if (!fields) return row;
  const out: Row = { ...row };
  for (const field of fields) {
    const value = out[field];
    // Always encrypt: rows reach the push route from devices, which only ever
    // hold plain text, so a value that looks like a blob ("f1: …") is the
    // person's own words and must not be stored as it is.
    if (typeof value !== "string") continue;
    out[field] = encryptField(value, { userId, tableName, rowId: String(row.id), field });
  }
  return out as R;
}

/**
 * `row` with its table's encrypted fields as plain text. A field that does
 * not decrypt becomes {@link UNREADABLE_TEXT}, so one bad row never stalls a
 * device's pull; `onUnreadable` is told which.
 */
export function decryptRowFields<R extends Row>(
  tableName: TableName,
  row: R,
  userId: string,
  onUnreadable?: (field: string, error: unknown) => void,
): R {
  const fields = ENCRYPTED_FIELDS[tableName];
  if (!fields) return row;
  const out: Row = { ...row };
  for (const field of fields) {
    const value = out[field];
    if (typeof value !== "string") continue;
    try {
      out[field] = decryptField(value, { userId, tableName, rowId: String(row.id), field });
    } catch (error) {
      if (!(error instanceof FieldDecryptError)) throw error;
      onUnreadable?.(field, error);
      out[field] = (UNREADABLE_TEXT as Record<string, string>)[field] ?? "";
    }
  }
  return out as R;
}
