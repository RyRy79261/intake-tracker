/**
 * Tests for POST /api/ai/voice-transcribe — the route handler.
 *
 * Unlike the Claude routes, this one POSTs multipart form-data to Groq's
 * hosted Whisper endpoint via global `fetch`. Strategy:
 *   - Pass-through withAuth injecting a fixed auth context.
 *   - Mock @/lib/ai-key-resolver so resolveAiKey returns a fake Groq key (the
 *     route believes a key is configured).
 *   - Mock the usage-tracker so recordUsage never touches the DB.
 *   - Mock global `fetch` per test to drive the upstream Groq response.
 *
 * Covers the happy path, input validation (missing field, empty file,
 * oversized file, unsupported MIME), and the AI-failure path (Groq returns a
 * non-OK status / fetch throws → graceful error, not a crash).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as AiKeyResolverMod from "@/lib/ai-key-resolver";

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string; email: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      });
  },
}));

// Route believes a Groq key is configured. Partial mock: only resolveAiKey
// is stubbed — NoAiKeyError must remain the real class because
// ai-error-response.ts does `error instanceof NoAiKeyError`.
vi.mock("@/lib/ai-key-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof AiKeyResolverMod>();
  return {
    ...actual,
    resolveAiKey: vi.fn(async () => ({
      apiKey: "gsk-test",
      source: "env_var" as const,
      keyOwnerId: null,
    })),
  };
});

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: vi.fn(),
}));

/** Build a multipart NextRequest carrying an audio File under the given field. */
function makeAudioRequest(
  field: string,
  file: File | null,
): NextRequest {
  const form = new FormData();
  if (file) form.append(field, file);
  return new NextRequest("https://example.test/api/ai/voice-transcribe", {
    method: "POST",
    body: form,
  });
}

function audioFile(bytes: number, type = "audio/webm", name = "clip.webm"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("voice-transcribe route handler", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("happy path: returns 200 with the trimmed transcript text from Groq", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: "  blood pressure 120 over 80  ", duration: 4.2 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("audio", audioFile(2048)));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text).toBe("blood pressure 120 over 80");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Confirm the request went to Groq with the bearer key.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("api.groq.com");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk-test");
  });

  it("rejects a request missing the 'audio' form field with 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("wrongfield", audioFile(1024)));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing audio file");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty (0-byte) audio file with 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("audio", audioFile(0)));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Audio file is empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized audio file (> 20 MB) with 413", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(
      makeAudioRequest("audio", audioFile(20 * 1024 * 1024 + 1)),
    );

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Audio too large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported MIME type with 415", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(
      makeAudioRequest("audio", audioFile(1024, "application/pdf", "doc.pdf")),
    );

    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Unsupported audio type");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 422 when Groq transcribes only silence (empty text)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: "   ", duration: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("audio", audioFile(1024)));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("no speech detected");
  });

  it("maps a Groq 401 to a 400 INVALID_KEY response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("audio", audioFile(1024)));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.code).toBe("INVALID_KEY");
  });

  it("AI-failure path: a non-OK Groq response yields a graceful 502, not a crash", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "internal error",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("audio", audioFile(1024)));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; status?: number };
    expect(body.error).toBe("Transcription service failed");
    expect(body.status).toBe(500);
  });

  it("AI-failure path: a thrown fetch error yields a graceful 502, not a crash", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/ai/voice-transcribe/route");
    const res = await POST(makeAudioRequest("audio", audioFile(1024)));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to transcribe audio");
  });
});
