import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptKey, decryptKey, lastFourOf } from "@/lib/key-vault";

describe("key-vault", () => {
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.API_KEY_ENCRYPTION_SECRET;
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.API_KEY_ENCRYPTION_SECRET;
    } else {
      process.env.API_KEY_ENCRYPTION_SECRET = originalSecret;
    }
  });

  it("round-trips a plaintext string", () => {
    const plain = "sk-ant-abc123XYZ";
    const aad = { userId: "user_42", provider: "anthropic" as const };
    const blob = encryptKey(plain, aad);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptKey(blob, aad)).toBe(plain);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const aad = { userId: "u", provider: "anthropic" as const };
    const a = encryptKey("hello", aad);
    const b = encryptKey("hello", aad);
    expect(a).not.toBe(b);
    expect(decryptKey(a, aad)).toBe("hello");
    expect(decryptKey(b, aad)).toBe("hello");
  });

  it("fails to decrypt with a different userId (AAD mismatch)", () => {
    const blob = encryptKey("secret", { userId: "alice", provider: "groq" });
    expect(() =>
      decryptKey(blob, { userId: "bob", provider: "groq" }),
    ).toThrow();
  });

  it("fails to decrypt with a different provider (AAD mismatch)", () => {
    const blob = encryptKey("secret", { userId: "alice", provider: "anthropic" });
    expect(() =>
      decryptKey(blob, { userId: "alice", provider: "groq" }),
    ).toThrow();
  });

  it("rejects malformed blobs", () => {
    expect(() =>
      decryptKey("v1:notenough", { userId: "u", provider: "anthropic" }),
    ).toThrow();
    expect(() =>
      decryptKey("v9:foo:bar:baz", { userId: "u", provider: "anthropic" }),
    ).toThrow(/Unknown key blob version/);
  });

  it("lastFourOf returns the trailing four chars", () => {
    expect(lastFourOf("sk-ant-abcd1234")).toBe("1234");
    expect(lastFourOf("ab")).toBe("ab");
    expect(lastFourOf("")).toBe("");
  });

  it("throws when API_KEY_ENCRYPTION_SECRET is unset", () => {
    const saved = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    try {
      expect(() =>
        encryptKey("x", { userId: "u", provider: "anthropic" }),
      ).toThrow(/API_KEY_ENCRYPTION_SECRET/);
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = saved;
    }
  });

  it("rejects a secret of the wrong length", () => {
    const saved = process.env.API_KEY_ENCRYPTION_SECRET;
    process.env.API_KEY_ENCRYPTION_SECRET = "too-short";
    try {
      expect(() =>
        encryptKey("x", { userId: "u", provider: "anthropic" }),
      ).toThrow(/32 bytes/);
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = saved;
    }
  });
});
