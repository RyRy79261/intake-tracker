import { describe, it, expect } from "vitest";
import {
  isCryptoAvailable,
  encrypt,
  decrypt,
  hashPin,
  verifyPin,
  generateSecureId,
} from "@/lib/crypto";

describe("isCryptoAvailable", () => {
  it("returns false when window is undefined (node environment)", () => {
    expect(isCryptoAvailable()).toBe(false);
  });
});

describe("encrypt / decrypt", () => {
  // Web Crypto's SubtleCrypto is exposed on globalThis.crypto in Node, but the
  // crypto module's isCryptoAvailable() guard requires `window`. Shim it.
  function withWindow<T>(fn: () => Promise<T>): Promise<T> {
    const had = "window" in globalThis;
    if (!had) {
      (globalThis as { window?: unknown }).window = { crypto: globalThis.crypto };
    }
    return fn().finally(() => {
      if (!had) delete (globalThis as { window?: unknown }).window;
    });
  }

  it("round-trips plaintext through encrypt then decrypt", async () => {
    await withWindow(async () => {
      const secret = "my health data 123";
      const enc = await encrypt(secret, "pin-1234");
      expect(await decrypt(enc, "pin-1234")).toBe(secret);
    });
  });

  it("produces ciphertext that differs from the plaintext", async () => {
    await withWindow(async () => {
      const secret = "sensitive";
      const enc = await encrypt(secret, "pin");
      expect(enc.data).not.toContain(secret);
      expect(enc.data.length).toBeGreaterThan(0);
    });
  });

  it("uses a fresh random IV and salt per encryption", async () => {
    await withWindow(async () => {
      const a = await encrypt("same", "pin");
      const b = await encrypt("same", "pin");
      expect(a.iv).not.toBe(b.iv);
      expect(a.salt).not.toBe(b.salt);
      expect(a.data).not.toBe(b.data);
    });
  });

  it("tags the payload with a version number", async () => {
    await withWindow(async () => {
      const enc = await encrypt("x", "pin");
      expect(enc.version).toBe(1);
    });
  });

  it("fails to decrypt with the wrong PIN", async () => {
    await withWindow(async () => {
      const enc = await encrypt("top secret", "correct-pin");
      await expect(decrypt(enc, "wrong-pin")).rejects.toThrow(
        /Decryption failed/,
      );
    });
  });

  it("fails to decrypt tampered ciphertext", async () => {
    await withWindow(async () => {
      const enc = await encrypt("integrity", "pin");
      const tampered = { ...enc, data: btoa("corrupted-bytes-here") };
      await expect(decrypt(tampered, "pin")).rejects.toThrow();
    });
  });

  it("round-trips unicode content", async () => {
    await withWindow(async () => {
      const secret = "café ❤ 日本語";
      const enc = await encrypt(secret, "pin");
      expect(await decrypt(enc, "pin")).toBe(secret);
    });
  });

  it("throws when crypto is unavailable", async () => {
    await expect(encrypt("x", "pin")).rejects.toThrow(
      "Web Crypto API not available",
    );
  });
});

describe("hashPin / verifyPin", () => {
  function withWindow<T>(fn: () => Promise<T>): Promise<T> {
    const had = "window" in globalThis;
    if (!had) {
      (globalThis as { window?: unknown }).window = { crypto: globalThis.crypto };
    }
    return fn().finally(() => {
      if (!had) delete (globalThis as { window?: unknown }).window;
    });
  }

  it("verifies a PIN against its own hash", async () => {
    await withWindow(async () => {
      const { hash, salt } = await hashPin("1234");
      expect(await verifyPin("1234", hash, salt)).toBe(true);
    });
  });

  it("rejects an incorrect PIN", async () => {
    await withWindow(async () => {
      const { hash, salt } = await hashPin("1234");
      expect(await verifyPin("0000", hash, salt)).toBe(false);
    });
  });

  it("is deterministic given the same salt", async () => {
    await withWindow(async () => {
      const first = await hashPin("pin");
      const saltBytes = Uint8Array.from(atob(first.salt), (c) =>
        c.charCodeAt(0),
      );
      const second = await hashPin("pin", saltBytes);
      expect(second.hash).toBe(first.hash);
    });
  });
});

describe("generateSecureId", () => {
  it("returns a 32-char hex string (16 bytes)", () => {
    expect(generateSecureId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSecureId()));
    expect(ids.size).toBe(100);
  });
});
