/**
 * Property-based round-trip tests for the crypto module.
 *
 * encrypt / decrypt are inverse functions modulo the PIN. The
 * fundamental invariant:
 *
 *   for all (plaintext, pin):
 *     decrypt(encrypt(plaintext, pin), pin) === plaintext
 *
 * And the security counterpart — a wrong PIN must throw, not silently
 * return garbage:
 *
 *   for all (plaintext, pin1 != pin2):
 *     decrypt(encrypt(plaintext, pin1), pin2) throws
 *
 * Why this matters: the backup-service uses these for the encrypted-
 * backup feature. A regression that ever returns wrong plaintext
 * silently corrupts the user's restored data. The wrong-pin guarantee
 * is also security-critical — a quiet pass would let a brute-force
 * attacker know nothing about success/failure.
 *
 * Runtime: each property runs only ~10 iterations because each call
 * does PBKDF2 (100_000 iterations of SHA-256 under the hood), which is
 * deliberately slow. The point is correctness, not throughput.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { encrypt, decrypt, isCryptoAvailable } from "@/lib/crypto";

// crypto.ts's isCryptoAvailable() gates on `window.crypto?.subtle`,
// which is browser-flavoured. Vitest's node env doesn't ship a window
// but does ship a Node 22+ WebCrypto via globalThis.crypto. Bridge
// the two with a minimal shim so the module's own gate passes and the
// underlying crypto.subtle calls resolve normally.
const hadWindow = typeof (globalThis as Record<string, unknown>).window !== "undefined";
beforeAll(() => {
  if (!hadWindow) {
    (globalThis as Record<string, unknown>).window = {
      crypto: globalThis.crypto,
    };
  }
});
afterAll(() => {
  if (!hadWindow) {
    delete (globalThis as Record<string, unknown>).window;
  }
});

// fast-check's default string arbitrary emits surrogate-pair edge
// cases; restrict to a printable subset for reliable UTF-8 round-trip.
const plaintext = fc.string({ minLength: 0, maxLength: 200 });
// PINs are typically 4-12 digits in product, but the function accepts
// arbitrary strings — pin any non-empty string so wrong-PIN tests
// can distinguish.
const pin = fc.string({ minLength: 1, maxLength: 32 });

describe("crypto — encrypt/decrypt round-trip (property)", () => {
  // Sanity: the window shim should make isCryptoAvailable() pass.
  it("isCryptoAvailable() passes after the window shim", () => {
    expect(isCryptoAvailable()).toBe(true);
  });

  it("decrypt(encrypt(plaintext, pin), pin) === plaintext for any input", async () => {
    await fc.assert(
      fc.asyncProperty(plaintext, pin, async (text, p) => {
        const enc = await encrypt(text, p);
        const dec = await decrypt(enc, p);
        expect(dec).toBe(text);
      }),
      // Keep iteration count low — PBKDF2 is expensive by design.
      { numRuns: 6 },
    );
  }, 30_000);

  it("encrypted output structure has non-empty data/iv/salt fields", async () => {
    await fc.assert(
      fc.asyncProperty(plaintext, pin, async (text, p) => {
        const enc = await encrypt(text, p);
        expect(typeof enc.data).toBe("string");
        expect(typeof enc.iv).toBe("string");
        expect(typeof enc.salt).toBe("string");
        expect(enc.data.length).toBeGreaterThan(0);
        expect(enc.iv.length).toBeGreaterThan(0);
        expect(enc.salt.length).toBeGreaterThan(0);
      }),
      { numRuns: 4 },
    );
  }, 30_000);

  it("two encryptions of the same plaintext produce different ciphertexts (IV randomness)", async () => {
    // Hardcoded plaintext + pin so the only entropy source is the
    // random IV + salt inside encrypt(). If the IV ever became
    // deterministic (or the function reused a buffer), this property
    // would flag it.
    const enc1 = await encrypt("regression-guard-plaintext", "test-pin");
    const enc2 = await encrypt("regression-guard-plaintext", "test-pin");

    // The encrypted blobs must differ — same plaintext but different
    // IVs/salts produce different ciphertexts under AES-GCM.
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.salt).not.toBe(enc2.salt);
    expect(enc1.data).not.toBe(enc2.data);

    // But both must decrypt to the same plaintext.
    expect(await decrypt(enc1, "test-pin")).toBe(
      "regression-guard-plaintext",
    );
    expect(await decrypt(enc2, "test-pin")).toBe(
      "regression-guard-plaintext",
    );
  }, 30_000);

  it("wrong PIN throws — never silently returns garbage plaintext", async () => {
    // Critical security property. A quiet decryption "success" with a
    // wrong PIN that returns random-looking bytes would defeat the
    // PIN-protection model.
    await fc.assert(
      fc.asyncProperty(
        plaintext,
        pin,
        pin,
        async (text, correctPin, otherPin) => {
          // Skip the (rare but possible) case where fast-check picks
          // the same PIN twice.
          fc.pre(correctPin !== otherPin);
          const enc = await encrypt(text, correctPin);
          await expect(decrypt(enc, otherPin)).rejects.toThrow();
        },
      ),
      { numRuns: 5 },
    );
  }, 60_000);
});
