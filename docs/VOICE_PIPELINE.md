# Voice pipeline — from spoken audio to approved records

How a single voice recording becomes a reviewable list of proposed health
records, and where each moving part lives. This is the "structured prompt →
structured tool output → per-item validation → approve/reject UI" system.

## The five stages at a glance

```
 Mic (MediaRecorder)                          browser
   │  audio blob (webm/opus, or mp4 on iOS Safari)
   ▼
 POST /api/ai/voice-transcribe                server → Groq
   │  { text: "112 over 75, a coffee and a toasted cheese sandwich" }
   ▼
 POST /api/ai/voice-parse                     server → Anthropic Claude
   │  { items: [ {kind:"blood_pressure",...}, {kind:"caffeine",...},
   │             {kind:"food",...} ], reasoning: "..." }
   ▼
 Review UI (VoicePanel)                       browser
   │  user edits / approves / rejects each row
   ▼
 Domain mutation hooks → Dexie (IndexedDB)    browser
      one write per approved item, then sync mirrors to Neon
```

There is no streaming and no agentic loop — two stateless API calls, each
with hard validation on the way out.

## Stage 1 — Recording (`src/components/voice/voice-recorder.tsx`)

`MediaRecorder` captures mic audio, preferring `audio/webm;codecs=opus`
(Chrome/Edge/Firefox) and falling back to `audio/mp4` (iOS Safari 14.3+).
The blob and its mime type go to `VoicePanel.handleRecorded`, which picks a
filename extension and posts multipart form-data.

## Stage 2 — Transcription (`src/app/api/ai/voice-transcribe/route.ts`)

The server relays the audio to **Groq's hosted Whisper**
(`whisper-large-v3-turbo`) at their OpenAI-compatible endpoint:

- `GROQ_ENDPOINT = https://api.groq.com/openai/v1/audio/transcriptions`
  (a hardcoded const — see "Self-hosting the transcription leg" below)
- Multipart field `file`, plus `model`, `temperature: 0`, and
  `response_format: verbose_json` (gives a `duration` field for usage
  accounting).

The one piece of prompting at this stage is the **domain-vocabulary prompt**
(`DOMAIN_PROMPT`). Whisper accepts a `prompt` parameter that biases token
recognition; ours lists health-dictation vocabulary ("systolic over
diastolic mmHg", "sodium mg salt pinch", "ABV percent", …), which
dramatically improves accuracy on numbers, units and food words. It is a
recognition bias, not an instruction — Whisper doesn't "follow" it.

Guards: 20 MB size cap, mime allowlist, 30s timeout, per-IP rate limit,
auth + key resolution before any bytes are forwarded. Output is just
`{ text }`.

## Stage 3 — Structured parsing (`/api/ai/voice-parse`)

This is the interesting prompt-engineering layer. Three artifacts cooperate:

### 3a. The system prompt (`packages/ai-prompts/src/voice-parse.ts`)

`SYSTEM_PROMPT` tells Claude to treat the transcript as **multiple distinct
events in one utterance** and extract each as its own item. It defines the
nine item kinds (`blood_pressure`, `weight`, `water`, `salt`, `food`,
`caffeine`, `alcohol`, `urination`, `defecation`) and, crucially, encodes
the domain math so the model normalises units *before* the app ever sees
the data:

- lbs → kg (`kg = lbs * 0.4536`), oz → ml, "cup"/"glass" → 240/250 ml
- "1g of salt" → 400 mg **sodium** (salt ≠ sodium)
- alcohol always as `abvPercent` + `volumeMl`, never "standard drinks" —
  the app derives drinks itself (`@intake/core/alcohol`)
- food carries its own fluid (`waterMl`), so "glass of orange juice" is one
  food item, not food + water double-counted
- dissolved solutes never displace fluid volume (a 60 ml ice lolly with 10 g
  sugar is still 60 ml of water)
- calibration examples for sugar/potassium/caffeine estimates baked into
  the field descriptions

Rule 8 is the contract: *"Always call the parse_voice_log tool. Never
return prose only."*

### 3b. The tool schema (`PARSE_TOOL`, same file)

Instead of asking for JSON in prose (and regex-fishing it out), the route
uses **Anthropic tool use**: `PARSE_TOOL` is a JSON-Schema tool named
`parse_voice_log` whose input is `{ items: [...], reasoning }`. The model
"calls the tool", and the arguments it supplies *are* the structured
output — the API guarantees syntactically valid JSON matching the schema
shape. One deliberate compromise: Anthropic tool input schemas can't
express discriminated unions, so the schema lists every field as optional
on one item shape and real per-kind validation happens server-side (3d).

### 3c. The route (`route.ts`)

- `temperature: 0`, model `CLAUDE_MODELS.quality` (currently
  `claude-sonnet-4-6`), 60s per-call timeout.
- Transcript is sanitized (`sanitizeForAI`) and wrapped in `"""` fences.
- **Two-turn fallback:** if the first response contains no
  `parse_voice_log` tool_use block (model answered in prose), the route
  replays the conversation with the model's prose appended and
  `tool_choice: { type: "tool", name: "parse_voice_log" }`, which *forces*
  a tool call on the retry. Only after both attempts fail does the client
  see a 422.

### 3d. Per-item salvage validation (`schema.ts`)

`extractVoiceItems` validates the tool arguments with a Zod
**discriminated union** — per-kind required fields and physiological range
clamps (systolic 40–260, weight 1–500 kg, water ≤ 10 L, ABV ≤ 95%, …).

The key behaviour is **salvage, not all-or-nothing**: each item is
validated independently; malformed items are dropped (and counted/logged),
good ones survive, `reasoning` is truncated to 1000 chars rather than
rejected, and the result is capped at 20 items. The request only fails if
items were present and *none* survived. (Historically one bad item — or an
over-long reasoning string — 422'd the whole parse and threw away every
correct item; see CHANGELOG "salvage valid items instead of 422-ing the
whole parse".)

Response: `{ items: VoiceParsedItem[], reasoning? }`.

## Stage 4 — Review UI (`src/components/voice/voice-panel.tsx`)

Each item becomes a row (`ParsedItemRow`) with `approved: true | false |
null` — color-coded per domain, **editable in place** (the parse is a
proposal, not a commit), with approve/reject per row plus "Approve all" /
"Reject all". The model's `reasoning` string is rendered under the list so
the user can see what was estimated vs. heard. Nothing is written until
the user hits Save.

## Stage 5 — Commit (`VoicePanel.commit`)

Each approved item is dispatched to the same mutation hook a manual entry
would use — voice is just another input method, not a parallel data path:

| kind | hook | notes |
|---|---|---|
| blood_pressure | `useAddBloodPressure` | defaults position/arm; `note: "voice"` |
| weight | `useAddWeight` | |
| water / salt | `useAddIntake` | `source: "voice"` |
| food | `useAddComposableEntry` | one eating record + linked water/sodium/sugar/potassium intake records (`groupSource: "ai_food_parse"`); sugar/potassium only if those optional trackers are enabled |
| caffeine / alcohol | `useAddSubstance` | alcohol converts ABV+volume → standard drinks client-side |
| urination / defecation | `useAddUrination` / `useAddDefecation` | |

Failures are per-item: successes are kept, failures are reported in the
toast, and the panel stays open so the user can retry just the failed rows.

## Keys, auth, privacy

- Both routes sit behind `withAuth` + per-IP rate limiting; the transcript
  is PII-sanitized before leaving the server.
- Keys resolve via `src/lib/ai-key-resolver.ts` (own stored key → shared
  key → env-var fallback for whitelisted users): **Groq key** for
  transcription, **Anthropic key** for parsing. Users can bring their own
  keys under Settings → AI features. Neither key ever reaches the client.
- Token/audio-second usage is recorded per call (`recordUsage`) against
  whichever key owner served the request.

## Self-hosting the transcription leg (local Whisper instead of Groq)

The transcription call is a **plain OpenAI-compatible
`/v1/audio/transcriptions` request** — multipart `file` + `model` +
`prompt` + Bearer key. Any local server that speaks that dialect
(faster-whisper-server, speaches, whisper.cpp's server, LocalAI, an Ollama
front-end, …) can serve it verbatim.

What it takes today:

- `GROQ_ENDPOINT` and `GROQ_MODEL` are **hardcoded consts** in
  `voice-transcribe/route.ts` — there is currently no env-var override, so
  pointing at `http://localhost:8000/v1/audio/transcriptions` means editing
  those two lines (or adding e.g. `GROQ_BASE_URL` support first). Most
  local servers ignore the Bearer key, but the key-resolver still requires
  one to be configured — any placeholder string works.
- Keep the `prompt` (domain vocabulary) — local Whisper models honour it
  the same way and the accuracy win carries over.

The **parse leg is Anthropic-specific**: the route constructs
`new Anthropic({ apiKey })` with no `baseURL` override, and the two-turn
fallback relies on Anthropic tool-use semantics (`tool_choice`). A local
LLM would need an Anthropic-compatible proxy (e.g. LiteLLM) *and* a
`baseURL` passthrough added to `claude-client.ts`.

> Naming note: the transcription provider is **Groq** (LPU inference
> company hosting open Whisper weights) — no relation to xAI's Grok.

## Test coverage

- `voice-parse/schema.test.ts` — per-item salvage, range clamps, reasoning
  truncation, item cap.
- `voice-parse/route.test.ts` / `voice-transcribe/route.test.ts` — auth,
  rate limits, timeout mapping, two-turn fallback.
- `voice-panel` behaviour + `parsed-item-row` / `voice-launch-bar` DOM
  tests under `src/components/voice/`.
