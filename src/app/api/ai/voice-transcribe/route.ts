import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { resolveAiKey } from "@/lib/ai-key-resolver";
import { recordUsage } from "../_shared/usage-tracker";
import { aiErrorResponse } from "../_shared/ai-error-response";

/**
 * Transcribe a short audio clip using Groq's hosted
 * whisper-large-v3-turbo. The OpenAI-compatible endpoint accepts multipart
 * form-data with the field name `file`. The `prompt` parameter is a Whisper
 * convention that biases recognition toward domain vocabulary — for health
 * metrics this dramatically improves accuracy on numbers, units, and brand
 * names.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

const DOMAIN_PROMPT =
  "Health metrics dictation. Blood pressure systolic over diastolic mmHg, " +
  "heart rate bpm, weight kg, water ml, sodium mg salt pinch. " +
  "Food: slices, cheddar, toasted, sandwich, orange juice, coffee espresso. " +
  "Caffeine mg, alcohol units beer wine spirits. Urination defecation small medium large.";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB hard cap
const ALLOWED_MIME_PREFIXES = ["audio/", "video/webm", "video/mp4"];

const rateLimiter = createRateLimiter(30);

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);

    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    let resolved;
    try {
      resolved = await resolveAiKey(auth.userId!, auth.email, "groq");
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }
    const apiKey = resolved.apiKey;

    const form = await request.formData();
    const file = form.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file in form-data field 'audio'" },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio too large (max ${MAX_AUDIO_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    if (file.type && !ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${file.type}` },
        { status: 415 }
      );
    }

    console.log(`[AUDIT] voice-transcribe from user: ${auth.userId} (${file.size} bytes, ${file.type})`);

    const upstream = new FormData();
    // Groq accepts the file under "file"; preserve original filename for mime sniffing.
    upstream.append("file", file, file.name || "clip.webm");
    upstream.append("model", GROQ_MODEL);
    upstream.append("prompt", DOMAIN_PROMPT);
    // verbose_json includes a `duration` field (seconds) we record for usage.
    upstream.append("response_format", "verbose_json");
    upstream.append("temperature", "0");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    const startedAt = Date.now();
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return NextResponse.json(
          { error: "Transcription timed out" },
          { status: 504 }
        );
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[voice-transcribe] Groq ${response.status}: ${detail.slice(0, 500)}`);
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "groq",
        model: GROQ_MODEL,
        route: "/api/ai/voice-transcribe",
        status: "error",
        durationMs,
      });
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            error: "Groq rejected the API key. Update it in Settings → AI features.",
            code: "INVALID_KEY",
            provider: "groq",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "Transcription service failed", status: response.status },
        { status: 502 }
      );
    }

    const body = (await response.json()) as { text?: unknown; duration?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const audioSeconds =
      typeof body.duration === "number" && Number.isFinite(body.duration)
        ? Math.round(body.duration)
        : undefined;

    if (!text) {
      return NextResponse.json(
        { error: "Empty transcript — no speech detected" },
        { status: 422 }
      );
    }

    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "groq",
      model: GROQ_MODEL,
      route: "/api/ai/voice-transcribe",
      status: "success",
      durationMs,
      audioSeconds,
    });

    return NextResponse.json({ text });
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("voice-transcribe error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 502 }
    );
  }
});
