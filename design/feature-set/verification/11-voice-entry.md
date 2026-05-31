# Verification — 11-voice-entry

**Verdict:** minor-gaps  ·  checked 118 claims, verified 112.

All "Files covered" were read in full, plus the downstream services the commit logic
calls (`health-service.ts`, `substance-service.ts`, `urination-service.ts`,
`defecation-service.ts`, `composable-entry` hook), `api-fetch.ts`, `security.ts`,
`rate-limit.ts`, `claude-client.ts`, `settings-store.ts`, `auth-guard.ts`,
`permissions-section.tsx`, and the `voice-operator` manual. The document is highly
accurate on enums, presets, validation ranges, conversion factors, and the state
machines. The notable defects are (1) a mis-described `apiFetch` short-circuit path
that is actually dead code, (2) a slightly imprecise auth-gate boolean, and (3) an
un-mentioned 500-char sanitization truncation that overrides the documented
1–2000-char transcript range.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "A null/short-circuit response (`apiFetch` returning falsy via auth redirect) silently returns to `idle`." (and the `if (!transcribeRes)` / `if (!parseRes)` → `setStage("idle")` branches presented as live behavior) | `apiFetch` is typed `Promise<Response>` and **always returns a `Response` or throws** — it never returns falsy and has no auth-redirect short-circuit. The panel's `if (!transcribeRes)` / `if (!parseRes)` guards are therefore dead code; no "silent return to idle via falsy response" path exists. | api-fetch.ts:61-95; voice-panel.tsx:83-86, 100-103 |
| low | "Gated on auth — bar renders only when `useAuthGate()` returns true (auth **ready+authenticated**)." Also "auth **ready+authenticated**" in Features and Edge-cases. | `useAuthGate()` returns `!ready || authenticated` — i.e. true while auth is **not yet ready (loading)** OR authenticated. It is not strictly "ready AND authenticated"; the bar also renders during the pre-resolution loading window. | auth-guard.tsx:65-68 |
| low | Transcript "1–2000 chars (Zod `ParseRequestSchema`)" presented as the effective input bound; sanitization described only as PII stripping + empty-check. | `ParseRequestSchema` does allow 1–2000, but `sanitizeForAI` then hard-truncates to **500 chars** before the transcript reaches Claude. Effective max sent to the model is 500, not 2000. | voice-parse/route.ts:21-23, 90; security.ts:127-131 |
| low | Transcribe failure example: non-OK "throws with the server `error` message (e.g. 'Transcribe failed (status)')". | The Groq-failure branch returns HTTP **502** with `error: "Transcription service failed"`; the panel surfaces *that* message. "Transcribe failed (status)" is only the fallback when the server JSON lacks an `error` field. (Doc does note it as a fallback elsewhere, but the example conflates the two.) | voice-transcribe/route.ts:139-142; voice-panel.tsx:88-89 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `sanitizeForAI` truncates the (already PII-redacted, trimmed) transcript to a hard **500-char** cap before parsing — not surfaced anywhere in the doc. | security.ts:127-131 |
| low | Transcribe usage tracking records on **both** success and Groq-error paths (two `recordUsage` calls, `status: "success"` / `status: "error"`); doc only says routes "call `recordUsage(...)`" generically. | voice-transcribe/route.ts:119-128, 159-169 |
| low | Parse route records usage **per Anthropic call** — including the forced-tool follow-up turn (so a two-turn fallback bills/records twice). | voice-parse/route.ts:125-135, 168-178 |
| low | `extractVoiceItems` truncates the kept items to the first `MAX_ITEMS = 20` via `items.slice(0, MAX_ITEMS)`, and tracks/logs a `dropped` count for malformed items (`[VALIDATION] voice-parse: dropped N malformed item(s)`). Doc mentions MAX_ITEMS=20 and "malformed items dropped (logged)" but not the explicit `dropped` counter return field. | voice-parse/schema.ts:159-167, 180; voice-parse/route.ts:200-204 |
| low | Reasoning is only emitted when `obj.reasoning` is a **non-empty trimmed string**; whitespace-only reasoning becomes `undefined`, not an empty footnote. | voice-parse/schema.ts:173-176 |
| low | Caffeine commit: the linked water intake created service-side is only created when `volumeMl` is truthy/non-zero (`if (input.volumeMl)`), and is tagged `source: "water_intake"`. Doc says "Volume may create a linked water intake (service-side)" but not the source tag or the truthiness gate. | substance-service.ts:41-55 |
| low | Server BP item only emitted when both systolic+diastolic present is enforced by Zod (both required in the `blood_pressure` variant); standalone HR cannot validate. Doc states the rule as prompt-side; it is also schema-enforced. | voice-parse/schema.ts:10-18 |
| low | Recorder MIME→extension mapping in the panel (`mp4`/`aac`→`m4a`, `ogg`→`ogg`, else `webm`) used for the upload filename — undocumented detail. | voice-panel.tsx:69-77 |
| low | `getOptionalTrackerEnabled` (non-reactive snapshot) exists alongside the reactive `useOptionalTrackerEnabled`; only the reactive hook is referenced. (Voice path uses the reactive one, so not load-bearing.) | optional-trackers.ts:73-75 |

## Spot-confirmed

- 9 item kinds + labels + color tokens exactly as listed; `salt` → color `salt`, label **"Sodium"**; unknown-token fallback `bg-muted`. voice-types.ts:10-125; parsed-item-row.tsx:36-78, 431-434.
- Zod validation ranges digit-for-digit: BP systolic 40–260, diastolic 20–200, HR 20–250, note ≤200; weight 1–500; water 1–10000; salt 1–20000; food desc 1–200, grams 1–5000, waterMl 0–5000, sodiumMg 0–20000, sugarG 0–1000, potassiumMg 0–20000; caffeine desc 1–200, caffeineMg 0–2000, volumeMl 0–5000; alcohol desc 1–200, abvPercent 0–95, volumeMl 1–5000. voice-parse/schema.ts:9-65.
- `MAX_ITEMS = 20`, `MAX_REASONING_CHARS = 1000` (truncate, not reject), `REQUEST_TIMEOUT_MS = 60_000`, transcribe abort 30_000, parse rate-limit 20, transcribe rate-limit 30 (per-IP, 60s window). voice-parse/schema.ts:69-70; voice-parse/route.ts:103,49; voice-transcribe/route.ts:29,92; rate-limit.ts:check.
- Transcribe: `MAX_AUDIO_BYTES = 20MB`, MIME prefixes `audio/`/`video/webm`/`video/mp4`, model `whisper-large-v3-turbo`, `temperature 0`, `response_format verbose_json`, `duration`→audioSeconds. voice-transcribe/route.ts:17-27, 85-89, 145-150.
- Audio guards: empty→400, >20MB→413, bad MIME→415, empty transcript→422, Groq 401/403→400 INVALID_KEY "Update it in Settings → AI features". voice-transcribe/route.ts:62-78, 129-157.
- Two-turn forced-tool fallback; no tool block after retry → 422 "AI response format invalid"; resilient per-item validation; empty `items` is a valid result (toast "No items detected"). voice-parse/route.ts:137-199; schema.ts:153-184; voice-panel.tsx:113-118.
- Alcohol: `GRAMS_PER_STANDARD_DRINK = 10`, `ETHANOL_DENSITY_G_PER_ML = 0.789`; commit rounds std drinks to 1 dp (`Math.round(...*10)/10`); editor shows `≈ X.X standard drink(s)` (singular only when exactly "1.0"). alcohol-units.ts:7-19; voice-panel.tsx:249-250; parsed-item-row.tsx:335, 371.
- AI conversion factors digit-for-digit: lbs→kg ×0.4536, oz→ml ×29.5735, cup 240, glass 250, salt_g→sodium ×400, plain water glass 250; lager ~5/IPA ~6/wine ~13/vodka ~40; pint 568/half 284/wine glass 125–175/single 25–30/double 50. voice-parse/route.ts:29-34, 43.
- Recorder: `fftSize = 1024`, canvas 600×80, timer tick 100ms, codec order `audio/webm;codecs=opus`→`audio/webm`→`audio/mp4`→`audio/mp4;codecs=mp4a.40.2`, getUserMedia echoCancellation/noiseSuppression/autoGainControl all true, NotAllowedError→"Microphone permission denied", no-codec→"This browser does not support MediaRecorder for audio." voice-recorder.tsx:18-23, 144-149, 161, 187-189, 195-196, 137, 264-265.
- VoiceLaunchBar: hidden → `y:"150%", opacity:0`, `pointer-events-none`, `tabIndex=-1`, `aria-hidden`; default `transitionDuration = 0.2`; offset `76px + safe-area-inset-bottom` with QuickNav else `safe-area-inset-bottom`; null when `!showAi` or route≠`/`. voice-launch-bar.tsx:22-67; home-floating-bars.tsx:22; settings-store.ts:205 (barTransitionDurationMs default 200).
- Commit routing: BP `note ?? "voice"`, position `?? "sitting"`, arm `?? "left"`; weight `note ?? "voice"`; water/salt source `"voice"`; food `groupSource: "ai_food_parse"` with nutrient intakes tagged `manual:food_water_content`/`manual:sodium`/`manual:sugar`/`manual:potassium`, sugar/potassium gated on trackers; caffeine/alcohol via `addSubstance`; urination/defecation `note ?? "voice"`. Partial-failure keeps `ready`, clean save resets+closes; toast lists up to 3 failures; `queryClient.invalidateQueries()`. voice-panel.tsx:163-300.
- Optional-tracker gating reads both trackers unconditionally in the editor to keep hook order stable; disabled trackers hidden and excluded from save even with AI value. parsed-item-row.tsx:129-130, 263-291; voice-panel.tsx:214-229; optional-trackers.ts:67-69.
- Manual "The voice operator" exists (slug `voice-operator`), notes Groq (transcription) + Anthropic (parsing) keys; Settings → Permissions mic copy "For voice input". manuals.ts:457-489; permissions-section.tsx:61.

## Low-confidence / could-not-verify

- The doc frames the `if (!transcribeRes)`/`if (!parseRes)` idle branches as a real "auth redirect" path. With the current `apiFetch` they are unreachable, but a prior `apiFetch` revision may have returned `null` on redirect (e.g. a 302/401 swallow). I confirmed only the *current* `api-fetch.ts`; I did not trace git history to see whether the doc reflects a now-removed behavior. Treated as a medium inaccuracy against current code.
- "Slides away / fades in sync with the QuickNav footer scroll-hide behavior" — both bars receive `hidden={isHidden}` and the same transition duration from `HomeFloatingBars`, so they animate together; exact visual sync was reasoned from props, not rendered. home-floating-bars.tsx:17-43.
