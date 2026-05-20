import { describe, it, expect } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "../webhook-auth";

const SECRET = "test-secret-value";
const NOW = 1_700_000_000_000;

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed request", () => {
    const body = JSON.stringify({ hello: "world" });
    const timestamp = String(NOW);
    const signature = signWebhookPayload(timestamp, body, SECRET);

    expect(
      verifyWebhookSignature({
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ valid: true });
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ hello: "world" });
    const timestamp = String(NOW);
    const signature = signWebhookPayload(timestamp, body, SECRET);

    const result = verifyWebhookSignature({
      rawBody: body + " ",
      timestamp,
      signature,
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects a signature produced with a different secret", () => {
    const body = "{}";
    const timestamp = String(NOW);
    const signature = signWebhookPayload(timestamp, body, "wrong-secret");

    const result = verifyWebhookSignature({
      rawBody: body,
      timestamp,
      signature,
      secret: SECRET,
      now: NOW,
    });
    expect(result.reason).toBe("bad_signature");
  });

  it("rejects when the server secret is not configured", () => {
    const result = verifyWebhookSignature({
      rawBody: "{}",
      timestamp: String(NOW),
      signature: "abcd",
      secret: undefined,
      now: NOW,
    });
    expect(result.reason).toBe("no_secret");
  });

  it("rejects a missing signature header", () => {
    const result = verifyWebhookSignature({
      rawBody: "{}",
      timestamp: String(NOW),
      signature: null,
      secret: SECRET,
      now: NOW,
    });
    expect(result.reason).toBe("missing_signature");
  });

  it("rejects a missing timestamp header", () => {
    const result = verifyWebhookSignature({
      rawBody: "{}",
      timestamp: null,
      signature: "abcd",
      secret: SECRET,
      now: NOW,
    });
    expect(result.reason).toBe("missing_timestamp");
  });

  it("rejects a stale timestamp outside the replay window", () => {
    const body = "{}";
    const staleTimestamp = String(NOW - 10 * 60 * 1000);
    // A genuine signature for the stale timestamp — freshness is still enforced.
    const signature = signWebhookPayload(staleTimestamp, body, SECRET);

    const result = verifyWebhookSignature({
      rawBody: body,
      timestamp: staleTimestamp,
      signature,
      secret: SECRET,
      now: NOW,
    });
    expect(result.reason).toBe("stale_timestamp");
  });

  it("rejects a future timestamp outside the replay window", () => {
    const body = "{}";
    const futureTimestamp = String(NOW + 10 * 60 * 1000);
    const signature = signWebhookPayload(futureTimestamp, body, SECRET);

    const result = verifyWebhookSignature({
      rawBody: body,
      timestamp: futureTimestamp,
      signature,
      secret: SECRET,
      now: NOW,
    });
    expect(result.reason).toBe("stale_timestamp");
  });

  it("rejects a malformed (non-hex) signature", () => {
    const result = verifyWebhookSignature({
      rawBody: "{}",
      timestamp: String(NOW),
      signature: "not-hex",
      secret: SECRET,
      now: NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("bad_signature");
  });
});
