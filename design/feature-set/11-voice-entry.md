# 11 — Voice Entry

**Files covered:**
- `src/components/voice/voice-launch-bar.tsx` — floating launch bar + full-screen sheet host
- `src/components/voice/voice-panel.tsx` — pipeline orchestrator, item list, action bar, commit logic
- `src/components/voice/voice-recorder.tsx` — mic capture, waveform, timer, state machine
- `src/components/voice/parsed-item-row.tsx` — per-item color-coded editable review row
- `src/lib/voice-types.ts` — item kinds, item interfaces, color/label maps
- `src/app/api/ai/voice-transcribe/route.ts` — Groq Whisper audio→text endpoint
- `src/app/api/ai/voice-parse/route.ts` — Claude transcript→structured-items endpoint
- `src/app/api/ai/voice-parse/schema.ts` — Zod item schema, Anthropic tool def, resilient extractor
- `src/components/home-floating-bars.tsx` — mounts the launch bar on `/`
- Supporting: `src/lib/alcohol-units.ts`, `src/lib/optional-trackers.ts`, `src/hooks/use-composable-entry.ts`, `src/lib/help/manuals.ts` (voice-operator manual)

**Purpose:** A hands-free, multi-item logging surface. The user records one spoken utterance describing any mix of health events; the app transcribes it (Groq Whisper), extracts a heterogeneous list of structured items (Claude tool call), and presents each as an editable, individually approvable row. Only approved rows are written to their respective domains. It is the single fastest way to log many metrics at once.

---

## Features

- **Floating Voice-log launch bar** anchored to the bottom of the home screen (`/` only), above the QuickNav footer when present. Full-width button: a sky-tinted mic glyph chip + "Voice log" label. Slides away / fades in sync with the QuickNav footer scroll-hide behavior.
- **Gated on auth** — the bar renders only when `useAuthGate()` returns true. `useAuthGate()` returns `!ready || authenticated`, i.e. true while auth is **not yet ready (loading)** OR authenticated — not strictly "ready AND authenticated"; the bar also renders during the pre-resolution loading window. Hidden entirely otherwise.
- **Full-screen sheet** (`side="full"`) opens the Voice Panel; an `sr-only` "Voice log" title is provided for a11y.
- **Recorder** with one large circular record/stop button, a live audio waveform canvas, an elapsed `mm:ss` timer, and a textual status line.
- **Browser-codec negotiation** — picks the first supported MediaRecorder MIME type (`audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` → `audio/mp4;codecs=mp4a.40.2`); covers Chrome/Edge/Firefox (webm/opus) and iOS Safari 14.3+ (mp4).
- **Upload filename extension** — the panel derives the upload filename from the captured MIME type: `mp4`/`aac` → `clip.m4a`, `ogg` → `clip.ogg`, else `clip.webm`.
- **Captured audio constraints** — `echoCancellation`, `noiseSuppression`, `autoGainControl` all enabled on `getUserMedia`.
- **Three-stage pipeline:** transcribe → parse → review/commit, with per-stage status text:
  - "Transcribing with Groq Whisper…"
  - "Extracting items with Claude…"
- **Transcription** via Groq `whisper-large-v3-turbo`, biased by a health-domain Whisper prompt (improves number/unit/brand accuracy). `verbose_json` returns `duration` (recorded for usage).
- **Parsing** via Claude (`CLAUDE_MODELS.quality`, temp 0, max 2048 tokens) using a `parse_voice_log` tool. Returns an ordered list of typed items plus an optional `reasoning` string.
- **Transcript echo card** — once transcribed, shows the quoted transcript text.
- **Heterogeneous item extraction** — one utterance produces N items across 9 domains (BP, weight, water, sodium, food, caffeine, alcohol, urination, defecation).
- **Per-item review rows** — each item rendered with a domain color bar, an uppercase domain chip label, inline editable fields, and approve/reject icon buttons.
- **Live counts** — header shows "Items (X approved · Y pending)".
- **Bulk approve / reject** of all pending rows; **per-row** approve/reject toggle (re-tapping returns the row to pending).
- **AI reasoning note** — if returned, shown as a muted left-bordered footnote below the item list (assumptions/estimates explanation). Reasoning is only emitted when `reasoning` is a **non-empty trimmed string**; whitespace-only reasoning becomes `undefined` (no footnote).
- **Multi-item commit** — saves all approved rows, each into its proper Dexie domain via the appropriate mutation; failures are collected and surfaced.
- **Partial-failure resilience** — a clean save closes the sheet & resets; any failure keeps the review state open (with toast listing up to 3 failures) so the user can retry.
- **Unit conversions** are AI-side: lbs→kg, oz/cup/glass→ml, salt-g→sodium-mg, abv%+volume→standard drinks (client recomputes standard drinks too).
- **Optional-tracker gating** — sugar/potassium food fields and persistence are gated on `useOptionalTrackerEnabled`; disabled trackers are hidden in the editor and not written even if the AI returned a value.
- **Toast feedback** for: no items detected, processing failure (destructive), and "Saved X of Y" (destructive variant if any failure).
- **Help manual** ("The voice operator") documents usage; notes Voice requires a Groq key (transcription) + Anthropic key (parsing).

---

## User actions & interactions

- **Tap "Voice log" bar** → opens full-screen voice sheet. (Disabled / non-interactive while the bar is in its hidden/slid-away state: `tabIndex=-1`, `aria-hidden`, `pointer-events-none`.)
- **Tap circular record button** → requests mic permission, starts recording, starts waveform + timer.
- **Tap the same button while recording** (now a red destructive Stop/square) → stops capture; pipeline auto-starts (transcribe→parse).
- **Wait** through "Transcribing…" then "Extracting…" status; no manual step between stages.
- **Per-row field edits** — type into numeric/text inputs or pick from selects; edits update the in-memory item. Fields are disabled once a row is approved/rejected (only pending rows are editable) and during saving.
- **Tap row approve (check)** → marks row approved (ring highlight, "approved" tag). Tapping again → back to pending.
- **Tap row reject (X)** → marks row rejected (40% opacity, "rejected" tag). Tapping again → back to pending.
- **Tap "Approve all"** (green) → all currently-pending rows become approved.
- **Tap "Reject all"** (red) → all currently-pending rows become rejected.
- **Tap "Save N"** → commits approved rows. On full success: sheet closes, panel resets. On partial failure: stays open in `ready` state.
- **Close sheet** (overlay tap / swipe / system back) → dismisses without saving (no explicit confirm).
- **Record again** — after a parse, tapping record clears prior transcript/rows/reasoning/error and restarts.
- **Microphone permission denial** → recorder shows error state with "Microphone permission denied".

---

## States & presentations

**VoiceLaunchBar states:**
- **Visible** — `y:0, opacity:1`, pointer-events enabled, focusable.
- **Hidden** (scroll-hide active) — `y:"150%", opacity:0`, pointer-events off, removed from tab order, `aria-hidden`. Animated with configurable `transitionDuration` (default 0.2s, from settings `barTransitionDurationMs`).
- **Bottom-offset variants** — sits `76px + safe-area-inset-bottom` above QuickNav when present, else just `safe-area-inset-bottom`.
- **Not rendered** — when `useAuthGate()` is false (auth ready AND unauthenticated; note it stays *true* during the loading window), or when route ≠ `/`.

**VoiceRecorder state machine (`RecorderState`):** `idle | requesting | recording | processing | error`
- **idle** — default mic icon button (variant `default`); status "Tap to record"; timer `00:00`.
- **requesting** — spinner (Loader2) in button, button disabled; status "Requesting microphone…".
- **recording** — red `destructive` button with filled square stop icon; live waveform animating; border becomes `border-primary/40`; status "● Recording" (primary color); timer counting up every 100ms.
- **processing** — spinner in button, disabled; status "Processing…" (covers the onRecorded handoff before parent stages begin).
- **error** — destructive status text showing the error message (e.g., "Microphone permission denied", "This browser does not support MediaRecorder for audio.").
- **busy** (from parent) — button disabled whenever stage is transcribing/parsing/saving.

**VoicePanel stage machine (`stage`):** `idle | transcribing | parsing | ready | saving`
- **idle** — recorder ready, intro instructional copy, no items.
- **transcribing** — recorder `busy`; muted status "Transcribing with Groq Whisper…".
- **parsing** — recorder `busy`; muted status "Extracting items with Claude…".
- **ready** — items rendered; transcript card shown; action bar visible.
- **saving** — all row controls + action buttons disabled; "Save" in progress.
- **error** — destructive text under the recorder card; stage reverts to `idle`; destructive toast.
- **No-items result** — parse returned empty `items`; toast "No items detected / The transcript didn't contain extractable health metrics." No item card rendered.

**ParsedItemRow states:**
- **pending** (`approved === null`) — editable, neutral border, no tag.
- **approved** (`true`) — `ring-1` + domain-colored ring, "approved" tag, fields locked, approve button filled (variant `default`).
- **rejected** (`false`) — `opacity-40`, "rejected" tag, fields locked, reject button filled (variant `destructive`).
- **disabled** — during `saving`, all approve/reject buttons disabled.
- Each row always shows a left domain **color bar** (`w-1.5`) and an uppercase domain **chip**.

**Action bar (only when `rows.length > 0`):**
- Pinned to sheet bottom (safe-area padded), blurred translucent background.
- "Reject all" / "Approve all" split buttons — disabled when `pendingCount === 0` or saving.
- "Save N" full-width button — disabled when `approvedCount === 0` or saving; label shows count when >0.

**Offline / failure presentations:** Network/transcribe/parse errors surface as destructive toast + inline destructive text; pipeline returns to `idle`. A non-OK transcribe/parse response throws with the server `error` message; on a Groq failure the transcribe route returns HTTP 502 with `error: "Transcription service failed"` (the panel surfaces that message), and `"Transcribe failed (status)"` / `"Parse failed (status)"` is only the client fallback used when the server JSON lacks an `error` field. The panel's `if (!transcribeRes)` / `if (!parseRes)` → `setStage("idle")` branches are **dead code**: `apiFetch` is typed `Promise<Response>` and always returns a `Response` or throws — it never returns falsy and has no auth-redirect short-circuit, so no "silent return to idle via falsy response" path exists.

---

## Enums, options & configurable values

**Item kinds (`VoiceItemKind`, 9):** `blood_pressure`, `weight`, `water`, `salt`, `food`, `caffeine`, `alcohol`, `urination`, `defecation`.

**Per-kind labels (`VOICE_ITEM_LABEL`):**
- blood_pressure → "Blood pressure"
- weight → "Weight"
- water → "Water"
- salt → "Sodium"
- food → "Food"
- caffeine → "Caffeine"
- alcohol → "Alcohol"
- urination → "Urination"
- defecation → "Defecation"

**Per-kind color token (`VOICE_ITEM_COLOR` → Tailwind theme color):**
- blood_pressure → `bp`, weight → `weight`, water → `water`, salt → `salt`, food → `eating`, caffeine → `caffeine`, alcohol → `alcohol`, urination → `urination`, defecation → `defecation`. Each maps to concrete `bg-*`, `ring-*/30`, and `chip` (bg + foreground) classes. Unknown token fallback: `bg-muted`.

**Editor fields per kind:**
- **blood_pressure:** Systolic (int), Diastolic (int), Heart rate (int, optional/placeholder "—"). (`position`, `arm`, `note` not surfaced in editor; default on save.)
- **weight:** Weight (kg), step 0.1, decimal input.
- **water:** Water (ml), numeric.
- **salt:** Sodium (mg), numeric.
- **food:** Description (text), Grams (optional), Water (ml, optional), Sodium (mg, optional), Sugar (g, optional — only if sugar tracker enabled), Potassium (mg, optional — only if potassium tracker enabled).
- **caffeine:** Description (text), Caffeine (mg), Volume (ml, optional).
- **alcohol:** Description (text), % ABV (step 0.1), Volume (ml); shows derived "≈ X.X standard drink(s)".
- **urination / defecation:** Amount select — options `—` (sentinel `__none__`), `small`, `medium`, `large`.

**Enums:**
- BP `position`: `sitting` | `standing` (default `sitting` on save).
- BP `arm`: `left` | `right` (default `left` on save).
- urination/defecation `amountEstimate`: `small` | `medium` | `large` | (unset).

**Zod validation ranges (server, `ItemSchema`):**
- blood_pressure: systolic int 40–260, diastolic int 20–200, heartRate int 20–250, note ≤200 chars.
- weight: weightKg 1–500.
- water: ml 1–10000.
- salt: sodiumMg 1–20000.
- food: description 1–200 chars, grams 1–5000, waterMl 0–5000, sodiumMg 0–20000, sugarG 0–1000, potassiumMg 0–20000.
- caffeine: description 1–200, caffeineMg 0–2000, volumeMl 0–5000.
- alcohol: description 1–200, abvPercent 0–95, volumeMl 1–5000.

**Pipeline / API constants:**
- `MAX_ITEMS = 20` (response truncated to first 20).
- `MAX_REASONING_CHARS = 1000` (reasoning truncated, not rejected).
- Parse request transcript: Zod `ParseRequestSchema` accepts 1–2000 chars, but `sanitizeForAI` then hard-truncates the (already PII-redacted, trimmed) transcript to a **500-char** cap before it reaches Claude — so the effective max sent to the model is 500, not 2000.
- Parse model timeout: `REQUEST_TIMEOUT_MS = 60_000`; transcribe fetch timeout: `30_000`.
- Parse rate limit: 20/window; transcribe rate limit: 30/window.
- Transcribe: `MAX_AUDIO_BYTES = 20 MB`; allowed MIME prefixes `audio/`, `video/webm`, `video/mp4`; model `whisper-large-v3-turbo`; `temperature 0`, `response_format verbose_json`.
- Recorder analyser: `fftSize = 1024`; canvas 600×80; timer tick 100ms.

**AI-side conversion factors (system prompt):** lbs→kg ×0.4536; oz→ml ×29.5735; cup=240ml; glass=250ml; salt_g→sodium_mg ×400; plain glass of water = 250ml; example abv/volume references (lager ~5%, IPA ~6%, red wine ~13%, vodka ~40%; pint 568ml, half-pint 284ml, wine glass 125–175ml, single 25–30ml, double 50ml).

**Alcohol constants (`alcohol-units.ts`):** `GRAMS_PER_STANDARD_DRINK = 10`; `ETHANOL_DENSITY_G_PER_ML = 0.789`. Standard drinks rounded to 1 decimal on save.

**Required keys:** Groq key (transcription) + Anthropic key (parsing). Whisper domain `prompt` biases recognition. Settings → AI features manages keys; Settings → Permissions notes mic "For voice input".

---

## Data model touched

Each approved item is written via the matching domain mutation (sources tagged `voice` / `manual:*` / `ai_food_parse`):

- **blood_pressure** → `useAddBloodPressure` → `bloodPressureRecords` (systolic, diastolic, position default `sitting`, arm default `left`, optional heartRate, note default `"voice"`).
- **weight** → `useAddWeight` → `weightRecords` (weight=weightKg, note default `"voice"`).
- **water** → `useAddIntake` → `intakeRecords` (type `water`, amount=ml, source `voice`, optional note).
- **salt** → `useAddIntake` → `intakeRecords` (type `salt`, amount=sodiumMg, source `voice`, optional note).
- **food** → `useAddComposableEntry` (`groupSource: "ai_food_parse"`) → creates an `eatingRecords` row (note=description, optional grams) plus linked `intakeRecords` for each present nutrient: water (source `manual:food_water_content`), salt (`manual:sodium`), sugar (`manual:sugar`, gated on tracker), potassium (`manual:potassium`, gated on tracker).
- **caffeine** → `useAddSubstance` → `substanceRecords` (type `caffeine`, amountMg, optional volumeMl, description). A linked water `intakeRecords` row is created service-side **only when `volumeMl` is truthy/non-zero** (`if (input.volumeMl)`), tagged `source: "substance:<substanceId>"`.
- **alcohol** → `useAddSubstance` → `substanceRecords` (type `alcohol`, amountStandardDrinks [derived], abvPercent, volumeMl, description).
- **urination** → `useAddUrination` → `urinationRecords` (optional amountEstimate, note default `"voice"`).
- **defecation** → `useAddDefecation` → `defecationRecords` (optional amountEstimate, note default `"voice"`).

Server-side parse/transcribe routes write no user records; they call `recordUsage(...)` (AI usage tracking: provider, model, route, tokens, duration, audioSeconds). The **transcribe** route records usage on **both** outcomes — the Groq-error branch logs `status: "error"` and the success branch `status: "success"` (with `audioSeconds`). The **parse** route records usage **per Anthropic call** — once for the initial turn and again for the forced-tool follow-up turn, so a two-turn fallback records (and bills) twice. After commit, `queryClient.invalidateQueries()` refreshes all caches.

Types: `VoiceParsedItem` discriminated union (`BloodPressureItem | WeightItem | WaterItem | SaltItem | FoodItem | CaffeineItem | AlcoholItem | UrinationItem | DefecationItem`), `VoiceParseResponse { items, reasoning? }`, `RowState { item, approved: boolean | null }`.

---

## Validation, edge cases & business rules

- **Auth-gated rendering** — launch bar rendered when `useAuthGate()` (`!ready || authenticated`) is true; hidden only once auth has resolved and the user is unauthenticated (it remains visible during the loading window).
- **Two-turn tool fallback** — if Claude returns prose instead of calling `parse_voice_log`, the route retries with forced `tool_choice`. If still no tool block → 422 "AI response format invalid".
- **Resilient extraction** — each item Zod-validated independently; malformed items dropped, good ones kept. `extractVoiceItems` truncates the surviving items to the first `MAX_ITEMS = 20` (`items.slice(0, MAX_ITEMS)`) and returns a `dropped` count of how many failed validation; the route logs it (`[VALIDATION] voice-parse: dropped N malformed item(s)`) when `dropped > 0`. Fails only if `items` isn't an array, or items present but none survive. Reasoning over 1000 chars is truncated, never rejected (fix for prior whole-payload rejection).
- **Empty-result vs failure** — empty `items` is a valid result (toast "No items detected"), distinct from a 422 format failure.
- **Heart-rate orphans** — AI emits a `blood_pressure` item only if systolic+diastolic present; standalone HR is skipped (no HR-only item type). This is enforced both prompt-side and by the Zod schema: the `blood_pressure` variant requires `systolic` and `diastolic` (HR is optional), so a standalone-HR item cannot validate and is dropped.
- **Food vs water** — "glass of orange juice" → one food item carrying its own waterMl; AI must NOT also emit a separate water item. Plain "glass of water" → a water item, not food.
- **Multi-intake split** — "I had X and Y" → one item per distinct intake.
- **Sodium units** — values are mg of *sodium* not salt; AI converts salt grams (×400).
- **Standard-drinks rule** — AI always returns both abvPercent and volumeMl; never "units"/"standard drinks". Client derives standard drinks (`standardDrinksFromAbv`, rounded to 0.1) for storage and live editor display.
- **Optional-tracker enforcement** — sugar/potassium fields hidden in editor when disabled, and excluded from the composable-entry intakes on save even if the AI returned a value. The voice path uses the reactive `useOptionalTrackerEnabled` hook (read unconditionally for both trackers to keep hook order stable across item kinds); a separate non-reactive `getOptionalTrackerEnabled` snapshot exists in `optional-trackers.ts` but is not used here.
- **Editor lock** — rows become read-only once approved/rejected (must un-toggle to edit) and during saving.
- **Numeric parsing** — empty input on optional fields strips the key entirely (respecting `exactOptionalPropertyTypes`); non-finite parses fall back to 0 (`numberOrZero`).
- **Commit gating** — Save no-ops if no approved rows; bulk/Save buttons disabled by pending/approved counts and `saving`.
- **Partial failure** — failures collected per item; up to 3 shown in toast; on any failure the sheet stays open in `ready` state for retry; only a clean save resets + closes.
- **Recorder lifecycle safety** — on unmount, callbacks detached before `stop()` so a queued `onstop` can't call `onRecorded`/`setState` on a dead component; media tracks stopped; AudioContext closed.
- **Codec fallback** — if no MediaRecorder MIME type is supported → error state, no recording.
- **Audio guards (server)** — empty file → 400; >20MB → 413; disallowed MIME → 415; empty transcript → 422; Groq 401/403 → 400 with `INVALID_KEY`/provider hint ("Update it in Settings → AI features").
- **Timeouts** — parse 60s → 504 "AI request timed out"; transcribe 30s abort → 504 "Transcription timed out".
- **Input sanitization** — transcript run through `sanitizeForAI` (PII redaction + trim + hard **500-char** truncation); empty after sanitization → 400. The 500-char cap overrides the Zod 1–2000 range as the effective length sent to the model. Audit log lines emitted per call.
- **Rate limits** — 429 when exceeded (parse 20, transcribe 30 per window, per client IP).

---

## Sub-components / variants

- **`VoiceLaunchBar`** — auth-gated floating bottom bar that opens the full-screen voice sheet; handles slide/fade hide animation and QuickNav-aware offset.
- **`VoicePanel`** — orchestrates the transcribe→parse→review→commit pipeline; owns transcript/rows/stage/reasoning state; renders recorder card, transcript card, item list, reasoning note, and the pinned action bar; performs the multi-domain commit.
- **`VoiceRecorder`** — mic capture state machine; codec negotiation; live waveform canvas; elapsed timer; record/stop button; surfaces blob+MIME to parent via `onRecorded`.
- **`ParsedItemRow`** — color-coded, per-domain editable review card with approve/reject controls and pending/approved/rejected states.
  - **`ItemEditor`** (internal) — switch over `item.kind` rendering the correct field set; gates sugar/potassium fields on optional trackers.
  - **`Field`** (internal) — labeled form-field wrapper.
- **`voice-parse/schema.ts`** — `ItemSchema` (discriminated union), `PARSE_TOOL` (Anthropic tool def with flat union props), `extractVoiceItems` resilient extractor, `MAX_ITEMS`/reasoning limits.
- **`voice-transcribe/route.ts`** — Groq Whisper proxy with domain prompt, size/MIME guards, usage recording.
- **`voice-parse/route.ts`** — Claude proxy with system prompt, tool-forced fallback, per-item validation, usage recording.
- **`home-floating-bars.tsx`** — host that mounts the launch bar (and QuickNav) on the home route, outside the swipe-transform layer.
