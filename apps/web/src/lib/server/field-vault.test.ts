import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptField,
  decryptRowFields,
  encryptField,
  encryptRowFields,
  FieldDecryptError,
  isFieldCiphertext,
  UNREADABLE_TEXT,
} from "@/lib/server/field-vault";
import { encryptKey } from "@/lib/key-vault";

const AAD = { userId: "u1", tableName: "journalEntries" as const, rowId: "j1", field: "words" };

describe("field-vault", () => {
  let original: string | undefined;
  beforeAll(() => {
    original = process.env.API_KEY_ENCRYPTION_SECRET;
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
  });
  afterAll(() => {
    if (original === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
    else process.env.API_KEY_ENCRYPTION_SECRET = original;
  });

  it("round-trips text, with a fresh IV each time", () => {
    const a = encryptField("Pain in my left knee", AAD);
    const b = encryptField("Pain in my left knee", AAD);
    expect(a).not.toBe(b);
    expect(isFieldCiphertext(a)).toBe(true);
    expect(a).not.toContain("knee");
    expect(decryptField(a, AAD)).toBe("Pain in my left knee");
    expect(decryptField(b, AAD)).toBe("Pain in my left knee");
  });

  it("round-trips non-ASCII text", () => {
    const text = "Übelkeit nach dem Essen 🤢";
    expect(decryptField(encryptField(text, AAD), AAD)).toBe(text);
  });

  it("keeps an empty string empty (a deleted entry)", () => {
    expect(encryptField("", AAD)).toBe("");
    expect(decryptField("", AAD)).toBe("");
  });

  it.each([
    ["another user", { userId: "u2" }],
    ["another row", { rowId: "j2" }],
    ["another field", { field: "finding" }],
    ["another table", { tableName: "dailyNotes" as const }],
  ])("refuses a blob moved to %s", (_label, change) => {
    const blob = encryptField("secret", AAD);
    expect(() => decryptField(blob, { ...AAD, ...change })).toThrow(FieldDecryptError);
  });

  it("refuses a tampered blob", () => {
    const blob = encryptField("secret", AAD);
    const tampered = blob.slice(0, -4) + (blob.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptField(tampered, AAD)).toThrow(FieldDecryptError);
    expect(() => decryptField("f1:only-one-part", AAD)).toThrow(FieldDecryptError);
  });

  it("does not share a key with the API-key vault", () => {
    // Same secret, same text: the two vaults' ciphertexts are not interchangeable.
    const apiBlob = encryptKey("secret", { userId: "u1", provider: "anthropic" });
    const asField = `f1:${apiBlob.slice("v1:".length)}`;
    expect(() => decryptField(asField, AAD)).toThrow(FieldDecryptError);
  });

  it("refuses to run without the master secret", () => {
    const saved = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    try {
      expect(() => encryptField("x", AAD)).toThrow(/API_KEY_ENCRYPTION_SECRET/);
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = saved;
    }
  });

  describe("rows", () => {
    const row = { id: "j1", words: "My knee hurts", finding: "Knee pain", places: ["knee-l"], severity: 4 };

    it("encrypts only the listed fields of the listed tables", () => {
      const enc = encryptRowFields("journalEntries", row, "u1");
      expect(isFieldCiphertext(enc.words)).toBe(true);
      expect(isFieldCiphertext(enc.finding)).toBe(true);
      expect(enc.places).toEqual(["knee-l"]);
      expect(enc.severity).toBe(4);
      expect(encryptRowFields("dailyNotes", { id: "n1", note: "plain" }, "u1")).toEqual({ id: "n1", note: "plain" });
    });

    it("encrypts text that happens to look like a blob, and reads it back", () => {
      const odd = { ...row, words: "f1: my first note", finding: "f1:a:b:c" };
      const enc = encryptRowFields("journalEntries", odd, "u1");
      expect(enc.words).not.toBe(odd.words);
      expect(enc.finding).not.toBe(odd.finding);
      expect(decryptRowFields("journalEntries", enc, "u1")).toEqual(odd);
    });

    it("decrypts back to the row", () => {
      expect(decryptRowFields("journalEntries", encryptRowFields("journalEntries", row, "u1"), "u1")).toEqual(row);
    });

    it("replaces an unreadable field with a placeholder and reports it", () => {
      const enc = encryptRowFields("journalEntries", row, "u1");
      const unreadable: string[] = [];
      const out = decryptRowFields("journalEntries", enc, "u2", (field) => unreadable.push(field));
      expect(out.words).toBe(UNREADABLE_TEXT.words);
      expect(out.finding).toBe(UNREADABLE_TEXT.finding);
      expect(unreadable).toEqual(["words", "finding"]);
    });
  });
});
