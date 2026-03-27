# Phase 11: Push Notifications - Research

**Researched:** 2026-03-23
**Domain:** Web Push API, server-side scheduling, service worker push events
**Confidence:** HIGH

## Summary

This phase implements server-sent Web Push notifications for scheduled medication doses. The Web Push API is well-supported on Android/Chrome PWAs and the `web-push` npm library (v3.6.7) handles VAPID authentication and payload encryption. The main architectural challenge is scheduling: Vercel Hobby plan limits cron to once-per-day with +/-59min precision, making it unusable for dose-time notifications. The recommended solution is an external cron service (cron-job.org, free tier, per-minute frequency) calling a secured API route that checks due doses and sends pushes.

The existing codebase has strong foundations: `push-notification-service.ts` already handles permissions and `showNotification()`, `medication-notification-service.ts` already formats dose reminders, and `worker/index.js` is the merge point for service worker extensions. Server-side needs are new: Neon Postgres for subscription storage, `web-push` for sending, and a schedule-sync endpoint for the client to report its dose schedule to the server.

**Primary recommendation:** Use `web-push` + `@neondatabase/serverless` + external cron (cron-job.org free tier, 1-min interval) calling a `POST /api/push/send` route. Client syncs schedule data to server on app open and on schedule changes. Follow-up reminders fire unconditionally (not dose-taken-aware) to avoid server-client state sync complexity.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Web Push API with server-side scheduling
- Client registers push subscription via Push API, sends to server
- Server stores push subscriptions and dose schedules in Neon Postgres
- Server cron/scheduler fires at dose times, sends push via `web-push` npm library
- Service worker receives push event, shows notification
- Grouped by time slot: one notification per scheduled time, listing all meds at that time
- Title: "Time for your HH:MM medications", body: medication names with dosages
- Tag per time slot (prevents duplicates), `requireInteraction: true`
- Tap action: opens `/medications` with schedule tab focused
- Follow-up reminders: 2 additional at 10-min intervals (configurable)
- No notifications for missed doses from previous days (respects dayStartHour)
- Global enable/disable toggle in medication settings
- Follow-up count (default 2) and interval (default 10 min) configurable
- Settings stored in Zustand settings store

### Claude's Discretion
- VAPID key generation approach (CLI script vs runtime generation)
- Database schema for push subscriptions (new Postgres table vs Dexie)
- Cron implementation: Next.js API route with external cron, or standalone scheduler
- Whether follow-up reminders check if dose was actually taken
- Notification icon and badge assets
- How to handle subscription expiry/renewal

### Deferred Ideas (OUT OF SCOPE)
- Per-prescription notification opt-out
- iOS support (Safari push)
- Rich notification actions (Take/Skip buttons on notification)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTF-01 | Push notifications for scheduled doses (Android/PWA, iOS not required) | Web Push API + web-push library + VAPID auth + service worker push handler + server-side scheduling via external cron |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| web-push | 3.6.7 | VAPID auth, payload encryption, sending push notifications from Node.js | Only maintained Node.js library for Web Push protocol. Handles VAPID signing, AES-GCM encryption, and push service endpoint communication |
| @neondatabase/serverless | 1.0.2 | Postgres queries from Vercel serverless functions | Official Neon driver optimized for serverless/edge environments. HTTP-based, no persistent connections needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x (already installed) | Validate push subscription payloads and API inputs | All API route input validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @neondatabase/serverless | pg (node-postgres) | pg requires persistent connections; @neondatabase/serverless uses HTTP, better for serverless |
| External cron (cron-job.org) | Vercel Cron | Vercel Hobby plan limits cron to daily with +/-59min precision -- unusable for dose-time notifications |
| External cron (cron-job.org) | Vercel Pro plan | Would cost money; cron-job.org free tier is sufficient for a single-user app |

**Installation:**
```bash
pnpm add web-push @neondatabase/serverless
```

**Version verification:** web-push 3.6.7 (verified via npm view), @neondatabase/serverless 1.0.2 (verified via npm view).

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/
    api/
      push/
        subscribe/route.ts    # POST: Store push subscription + schedule data
        unsubscribe/route.ts  # POST: Remove push subscription
        send/route.ts         # POST: Cron-triggered, check due doses, send pushes
        sync-schedule/route.ts # POST: Client syncs dose schedule to server
  lib/
    push-db.ts                # Neon Postgres queries for push_subscriptions + schedules
    push-sender.ts            # web-push configuration and send logic
    push-notification-service.ts  # EXTENDED: add subscribeToPush(), unsubscribe()
    medication-notification-service.ts  # EXTENDED: minimal changes
worker/
  index.js                    # EXTENDED: push + notificationclick event listeners
scripts/
  generate-vapid-keys.js      # One-time CLI script to generate VAPID key pair
vercel.json                   # NEW: (only if Vercel cron is used as fallback)
```

### Pattern 1: External Cron + API Route for Push Sending
**What:** An external cron service (cron-job.org) calls `POST /api/push/send` every minute. The route queries Postgres for subscriptions with doses due in the current minute window, sends push notifications via `web-push`, and records sent notifications to prevent duplicates.
**When to use:** Always -- this is the primary scheduling mechanism.
**Example:**
```typescript
// src/app/api/push/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import webpush from "web-push";

// Verify cron secret to prevent unauthorized triggers
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Get current time as HH:MM
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = now.toISOString().split("T")[0];

  // Query subscriptions with doses due at this time
  const dueNotifications = await sql`
    SELECT s.endpoint, s.p256dh, s.auth_key, s.user_id,
           d.time_slot, d.medications_json
    FROM push_subscriptions s
    JOIN push_dose_schedules d ON d.user_id = s.user_id
    WHERE d.time_slot = ${currentTime}
      AND d.day_of_week = ${now.getDay()}
      AND NOT EXISTS (
        SELECT 1 FROM push_sent_log l
        WHERE l.user_id = s.user_id
          AND l.time_slot = ${currentTime}
          AND l.sent_date = ${today}
          AND l.follow_up_index = 0
      )
  `;

  // Send notifications
  for (const row of dueNotifications) {
    const payload = JSON.stringify({
      title: `Time for your ${row.time_slot} medications`,
      body: row.medications_json,
      tag: `dose-${row.time_slot}`,
      url: "/medications?tab=schedule",
    });

    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
      payload,
      { TTL: 600, urgency: "high" }
    );
  }

  return NextResponse.json({ sent: dueNotifications.length });
}
```

### Pattern 2: Client Schedule Sync
**What:** When the app opens or when prescriptions/schedules change, the client calls `POST /api/push/sync-schedule` with its current dose schedule. The server stores this as the source of truth for when to send pushes.
**When to use:** On app mount (when push is enabled), and after any medication/schedule mutation.
**Example:**
```typescript
// Client-side: sync schedule to server after changes
async function syncScheduleToServer(doseSlots: DoseSlot[]) {
  // Group by time slot
  const byTime = new Map<string, { name: string; dosage: string }[]>();
  for (const slot of doseSlots) {
    const key = slot.localTime;
    const meds = byTime.get(key) ?? [];
    meds.push({
      name: slot.prescription.genericName,
      dosage: `${slot.dosageMg}${slot.unit}`,
    });
    byTime.set(key, meds);
  }

  await fetch("/api/push/sync-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      schedules: Array.from(byTime.entries()).map(([time, meds]) => ({
        timeSlot: time,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // simplified; real impl derives from PhaseSchedule
        medicationsJson: meds.map(m => `${m.name} ${m.dosage}`).join(", "),
      })),
    }),
  });
}
```

### Pattern 3: Service Worker Push + Click Handling
**What:** Service worker listens for `push` events, shows notifications with the payload data. `notificationclick` opens the app to the schedule view.
**When to use:** Always -- this is the client-side push handler.
**Example:**
```javascript
// worker/index.js (appended to existing file)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: "/icons/icon-192.svg",
    tag: data.tag,
    requireInteraction: true,
    data: { url: data.url || "/medications?tab=schedule" },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/medications?tab=schedule";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes("/medications") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
```

### Anti-Patterns to Avoid
- **Client-side scheduling with setInterval**: Does not work when app is closed. The whole point of push notifications is to work when the app is not running.
- **Storing push subscriptions in IndexedDB (client-side)**: The server needs subscriptions to send pushes. Subscriptions must be in server-side storage.
- **Sending pushes without deduplication**: Without a `push_sent_log` table, the per-minute cron will re-send every minute. Always track what was already sent.
- **Relying on Vercel Hobby cron for dose-time precision**: Hobby plan only allows daily cron with +/-59 min precision. Do not attempt this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID signing + payload encryption | Custom crypto for push protocol | `web-push` library | The Web Push protocol involves ECDSA P-256 signing, HKDF key derivation, AES-128-GCM encryption. Extremely error-prone to implement. |
| Push subscription key conversion | Manual base64url <-> Uint8Array | `web-push` handles internally | applicationServerKey conversion is a common source of bugs |
| Postgres connection pooling in serverless | Manual pg.Pool management | `@neondatabase/serverless` | Handles HTTP-based queries without persistent connections, perfect for serverless |
| Notification permission UX | Custom permission flow | Extend existing `push-notification-service.ts` | Already handles permission requests, support detection, service worker fallback |

**Key insight:** The Web Push protocol is complex (RFC 8291 + RFC 8292 + VAPID). The `web-push` library abstracts all of this into a single `sendNotification()` call.

## Common Pitfalls

### Pitfall 1: VAPID Keys Must Be URL-Safe Base64
**What goes wrong:** Using standard base64 encoding for VAPID keys instead of URL-safe base64 (no padding, `+` -> `-`, `/` -> `_`).
**Why it happens:** Standard base64 libraries produce padded output with `+` and `/` characters.
**How to avoid:** Use `web-push.generateVAPIDKeys()` which outputs URL-safe base64. Store the output directly in env vars.
**Warning signs:** `InvalidCharacterError` or subscription failures on `PushManager.subscribe()`.

### Pitfall 2: applicationServerKey Must Be Uint8Array
**What goes wrong:** Passing the VAPID public key as a string to `PushManager.subscribe()`.
**Why it happens:** The browser API expects a `Uint8Array`, not a base64 string.
**How to avoid:** Convert with a utility function:
```typescript
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
```
**Warning signs:** `TypeError: Failed to execute 'subscribe' on 'PushManager'`.

### Pitfall 3: Push Subscription Expiry
**What goes wrong:** Subscriptions expire silently. Server keeps trying to send to expired endpoints, getting 410 Gone responses.
**Why it happens:** Push services (FCM) expire subscriptions after extended inactivity.
**How to avoid:** Handle 410 responses from `webpush.sendNotification()` by deleting the subscription from the database. Re-subscribe on app open if the existing subscription is no longer valid.
**Warning signs:** `WebPushError` with statusCode 410.

### Pitfall 4: Service Worker Scope and next-pwa Merging
**What goes wrong:** Push event listener not firing because it's in the wrong service worker or not properly merged.
**Why it happens:** `next-pwa` generates a service worker at `/sw.js` and merges files from the `worker/` directory. If the push handler is placed elsewhere, it won't be in the final SW.
**How to avoid:** All push event handlers go in `worker/index.js`. This file is already configured as the custom worker merge point via `customWorkerDir: 'worker'` in `next.config.js`.
**Warning signs:** Push events arrive at the push service but no notification appears.

### Pitfall 5: Cron Secret Not Set
**What goes wrong:** Anyone can trigger the push-send endpoint, spamming notifications.
**Why it happens:** Forgetting to set `CRON_SECRET` env var and validate it in the route handler.
**How to avoid:** Generate a random secret, set it in both cron-job.org headers and Vercel env vars. Validate on every request.
**Warning signs:** Unexpected notification sends in server logs.

### Pitfall 6: Duplicate Notifications from Minute-Level Cron
**What goes wrong:** Cron fires every minute, so the 08:30 dose gets re-sent at 08:31, 08:32, etc.
**Why it happens:** No deduplication tracking for sent notifications.
**How to avoid:** Use a `push_sent_log` table recording `(user_id, time_slot, sent_date, follow_up_index)`. The send route checks this before sending.
**Warning signs:** Phone buzzing repeatedly for the same dose time.

### Pitfall 7: next-pwa Disabled in Development
**What goes wrong:** Service worker not available during development, push events can't be tested.
**Why it happens:** `next.config.js` has `disable: process.env.NODE_ENV === 'development'` for next-pwa.
**How to avoid:** For push testing, either build and run production locally (`pnpm build && pnpm start`) or temporarily remove the disable flag.
**Warning signs:** `navigator.serviceWorker.ready` never resolves in dev mode.

## Discretion Recommendations

### VAPID Key Generation: CLI Script (Recommended)
Generate once, store forever. A simple script in `scripts/generate-vapid-keys.js`:
```javascript
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
```
Run once, paste output into `.env.local` and Vercel env vars. No runtime generation needed.

### Database Schema: New Postgres Tables (Recommended)
Push subscriptions MUST be server-side (the server needs them to send pushes). Dexie is client-only. Use Neon Postgres with these tables:

```sql
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE push_dose_schedules (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  time_slot TEXT NOT NULL,         -- "08:30"
  day_of_week INTEGER NOT NULL,    -- 0-6
  medications_json TEXT NOT NULL,   -- "Venlafaxine 150mg, Spironolactone 25mg"
  UNIQUE(user_id, time_slot, day_of_week)
);

CREATE TABLE push_sent_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  sent_date DATE NOT NULL,
  follow_up_index INTEGER NOT NULL DEFAULT 0,  -- 0=initial, 1=first followup, 2=second
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, time_slot, sent_date, follow_up_index)
);

CREATE TABLE push_settings (
  user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  follow_up_count INTEGER NOT NULL DEFAULT 2,
  follow_up_interval_minutes INTEGER NOT NULL DEFAULT 10,
  day_start_hour INTEGER NOT NULL DEFAULT 2
);
```

### Cron Implementation: External Cron Service (Recommended)
Use cron-job.org free tier:
- Create a job hitting `POST https://your-app.vercel.app/api/push/send`
- Frequency: every 1 minute
- Auth header: `Authorization: Bearer <CRON_SECRET>`
- Free tier allows 100 requests/day (sufficient for per-minute checks during waking hours; can be increased)
- **Important**: 100 requests/day on free tier = ~1.5 hours of per-minute coverage. For full 24h coverage at 1-min intervals (1440 requests), request a limit increase or become a sustaining member (5000/day limit). Alternatively, schedule the cron only during typical dose hours (e.g., 06:00-22:00 = 960 requests).

**Alternative**: If the user upgrades to Vercel Pro plan in the future, switch to `vercel.json` cron:
```json
{
  "crons": [{ "path": "/api/push/send", "schedule": "* * * * *" }]
}
```

### Follow-Up Reminders: Fire Unconditionally (Recommended)
Checking if a dose was taken requires the client to report dose-taken events to the server, adding significant complexity. Instead:
- Follow-ups fire at `time_slot + interval` and `time_slot + 2*interval` regardless
- The notification tag (`dose-08:30`) prevents stacking -- new notification replaces the previous one
- If the user already took the dose and dismissed the notification, the follow-up appears as a new notification (minor annoyance, but acceptable for v1)
- The `push_sent_log` tracks follow-up indices to ensure exactly the configured number of follow-ups

### Notification Icons: Use Existing SVG Icons
`/icons/icon-192.svg` is already used by `showNotification()`. Note from existing code comments: "SVG icons don't work well on mobile." A PNG version would be better for Android notifications. Recommend generating `/icons/icon-192.png` from the existing SVG as a future enhancement; for now, the SVG will work in most cases.

### Subscription Expiry: Handle 410 Gone
On `sendNotification()` failure with status 410, delete the subscription from `push_subscriptions`. On app open, check if the stored subscription is still valid via `pushManager.getSubscription()` and re-subscribe if needed.

## Code Examples

### VAPID Key Generation Script
```javascript
// scripts/generate-vapid-keys.js
// Run: node scripts/generate-vapid-keys.js
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
console.log("Add these to .env.local and Vercel environment variables:\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
```

### Push Subscription Client-Side
```typescript
// In push-notification-service.ts (extended)
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  const registration = await navigator.serviceWorker.ready;

  // Check existing subscription
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) return subscription;

  // Create new subscription
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return null;

  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  return subscription;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
```

### Server-Side Push Configuration
```typescript
// src/lib/push-sender.ts
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:notifications@intake-tracker.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export { webpush };
```

### Neon Postgres Query Helper
```typescript
// src/lib/push-db.ts
import { neon } from "@neondatabase/serverless";

function getSQL() {
  return neon(process.env.DATABASE_URL!);
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  const sql = getSQL();
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key)
    VALUES (${userId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    ON CONFLICT (user_id) DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      updated_at = NOW()
  `;
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | web-push, API routes | Yes | >=18 | -- |
| Neon Postgres | Subscription storage | Yes | N/A (cloud service) | -- |
| VAPID keys | Push authentication | No (must generate) | -- | Run generate script |
| cron-job.org account | Scheduled push sending | No (must create) | -- | Vercel Pro cron |
| Service worker (next-pwa) | Push event handling | Yes (production builds only) | -- | -- |

**Missing dependencies with no fallback:**
- VAPID key pair must be generated and added to env vars before push can work
- External cron service account must be created and configured

**Missing dependencies with fallback:**
- PNG notification icon: SVG works on most devices; PNG is better for Android

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (already configured) |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:tz` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTF-01a | Push subscription saved to Postgres | unit | `pnpm test -- src/__tests__/push-db.test.ts -x` | Wave 0 |
| NOTF-01b | Send route queries due doses and sends pushes | unit | `pnpm test -- src/__tests__/push-send.test.ts -x` | Wave 0 |
| NOTF-01c | Deduplication prevents re-sending | unit | `pnpm test -- src/__tests__/push-send.test.ts -x` | Wave 0 |
| NOTF-01d | Follow-up reminders scheduled at correct intervals | unit | `pnpm test -- src/__tests__/push-send.test.ts -x` | Wave 0 |
| NOTF-01e | 410 Gone deletes subscription | unit | `pnpm test -- src/__tests__/push-db.test.ts -x` | Wave 0 |
| NOTF-01f | Service worker push + notificationclick | manual-only | N/A (requires real browser + push service) | -- |
| NOTF-01g | Schedule sync endpoint stores dose data | unit | `pnpm test -- src/__tests__/push-db.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test:tz`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/push-db.test.ts` -- covers NOTF-01a, NOTF-01e, NOTF-01g (mocked Neon queries)
- [ ] `src/__tests__/push-send.test.ts` -- covers NOTF-01b, NOTF-01c, NOTF-01d (mocked web-push + Neon)
- [ ] No additional framework install needed (Vitest already configured)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GCM (Google Cloud Messaging) | Web Push with VAPID | 2016+ | VAPID eliminates need for GCM API key; web-push library handles both |
| `aesgcm` content encoding | `aes128gcm` (default) | 2019+ | web-push 3.x defaults to aes128gcm; no action needed |
| next-pwa actively maintained | next-pwa unmaintained (last update 2023) | 2023 | Still functional for this use case. next-pwa merges custom SW correctly. Future migration to @serwist/next possible but not required now |

**Deprecated/outdated:**
- GCM API key approach: replaced by VAPID. Do not use `gcmAPIKey` option in web-push.
- `aesgcm` content encoding: still supported but `aes128gcm` is the current standard.

## Open Questions

1. **Vercel Hobby Plan Cron Viability**
   - What we know: Hobby plan limits cron to daily with +/-59min precision
   - What's unclear: Whether the user plans to upgrade to Pro plan
   - Recommendation: Use external cron (cron-job.org) regardless. If user later upgrades to Vercel Pro, can switch to Vercel cron as a simplification.

2. **cron-job.org Free Tier Daily Limit**
   - What we know: Default limit is 100 requests/day. Per-minute for 16 waking hours = 960 requests.
   - What's unclear: Whether limit can be easily increased
   - Recommendation: Start with cron running only during likely dose hours (06:00-23:00 UTC+2 = ~1020 minutes). Request limit increase from cron-job.org, or reduce to every 2 minutes (510 requests). Alternatively, use a smarter approach: single daily cron call that reads the schedule and creates timed jobs via the cron-job.org REST API.

3. **User Identity for Single-User App**
   - What we know: App is single-user with Privy auth. Server needs a user_id to key subscriptions.
   - What's unclear: Whether to use Privy user ID or a simpler constant
   - Recommendation: Use Privy user ID from auth token. Falls back gracefully to a constant like "default-user" in LOCAL_AGENT_MODE.

4. **Database Schema Migration**
   - What we know: Neon Postgres is available but has no existing tables for this feature
   - What's unclear: Whether to use a migration tool (drizzle, prisma) or raw SQL
   - Recommendation: Raw SQL migration script for simplicity. Only 4 small tables. No ORM overhead needed for this scope.

## Sources

### Primary (HIGH confidence)
- [web-push npm](https://www.npmjs.com/package/web-push) - API reference, VAPID key generation, sendNotification signature
- [web-push GitHub](https://github.com/web-push-libs/web-push) - Complete README with usage patterns
- [Vercel Cron Docs](https://vercel.com/docs/cron-jobs/usage-and-pricing) - Hobby plan daily-only limitation confirmed
- [@neondatabase/serverless npm](https://www.npmjs.com/package/@neondatabase/serverless) - Serverless Postgres driver API
- [MDN PushManager.subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe) - Browser API reference

### Secondary (MEDIUM confidence)
- [cron-job.org](https://cron-job.org/en/) - Free external cron service, per-minute frequency, 100 req/day default
- [Next.js Web Push Notifications Guide](https://medium.com/@ameerezae/implementing-web-push-notifications-in-next-js-a-complete-guide-e21acd89492d) - Implementation patterns verified against official docs
- [Neon Next.js Guide](https://neon.com/docs/guides/nextjs) - Official Neon + Next.js integration guide

### Tertiary (LOW confidence)
- cron-job.org daily limit increase process (only FAQ mentions it, no details on approval timeline)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - web-push is the only maintained Node.js Web Push library; @neondatabase/serverless is the official Neon driver
- Architecture: HIGH - Web Push API is well-documented; external cron is a proven pattern
- Pitfalls: HIGH - well-documented gotchas from web-push GitHub issues and MDN docs
- Cron service choice: MEDIUM - cron-job.org free tier limits need validation under real usage

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain, 30 days)
