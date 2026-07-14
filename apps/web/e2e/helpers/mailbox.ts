/**
 * Nylas mailbox helper — receives real verification emails for the signup e2e.
 *
 * Backed by a Nylas "Agent Account": a real, deliverable managed mailbox on a
 * <subdomain>.nylas.email domain (ours: signup@intake-tracker.nylas.email). We
 * read it over the Nylas v3 REST API using only the application API key — no CLI
 * binary and no encrypted-store passphrase — so it runs identically locally and
 * in CI. Setup + WSL gotchas live in docs/e2e-live-user-testing.md.
 *
 * Required env (all provided as CI secrets):
 *   NYLAS_API_KEY        application API key (Bearer token)
 *   NYLAS_GRANT_ID       the agent-account grant id (== the inbox)
 *   NYLAS_INBOX_ADDRESS  base address, e.g. signup@intake-tracker.nylas.email
 *   NYLAS_API_BASE       optional; default https://api.eu.nylas.com (our app is EU)
 */

export interface NylasMessage {
  id: string;
  subject?: string;
  to?: { name?: string; email?: string }[];
  from?: { name?: string; email?: string }[];
  body?: string;
  snippet?: string;
  /** Unix seconds. */
  date?: number;
}

const API_BASE = process.env.NYLAS_API_BASE || "https://api.eu.nylas.com";

/** True when the four (three required + base) env vars needed to read mail are set. */
export function nylasConfigured(): boolean {
  return Boolean(
    process.env.NYLAS_API_KEY &&
      process.env.NYLAS_GRANT_ID &&
      process.env.NYLAS_INBOX_ADDRESS,
  );
}

function cfg(): { apiKey: string; grant: string; address: string } {
  const apiKey = process.env.NYLAS_API_KEY;
  const grant = process.env.NYLAS_GRANT_ID;
  const address = process.env.NYLAS_INBOX_ADDRESS;
  if (!apiKey || !grant || !address) {
    throw new Error(
      "Nylas mailbox not configured — set NYLAS_API_KEY, NYLAS_GRANT_ID and " +
        "NYLAS_INBOX_ADDRESS (see docs/e2e-live-user-testing.md).",
    );
  }
  return { apiKey, grant, address };
}

/**
 * A unique, deliverable address for a single signup run via plus-addressing:
 *   signup@intake-tracker.nylas.email → signup+r<tag>@intake-tracker.nylas.email
 * Every variant lands in the same agent-account inbox (verified against the live
 * API), but the app sees a distinct address per run so re-runs never collide.
 */
export function uniqueSignupAddress(tag = String(Date.now())): string {
  const { address } = cfg();
  const [local, domain] = address.split("@");
  const safe = tag.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "run";
  return `${local}+r${safe}@${domain}`;
}

async function nylasGet<T>(path: string): Promise<T> {
  const { apiKey } = cfg();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Nylas GET ${path} → ${res.status} ${detail}`.trim());
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll the inbox until a message delivered to `address` arrives, then return it
 * (fetching the full body if the list view omitted it). Filters on the `to`
 * field and a `since` floor so it never matches an older or cross-run message.
 */
export async function waitForEmail(
  address: string,
  opts: { timeoutMs?: number; pollMs?: number; since?: number } = {},
): Promise<NylasMessage> {
  const { grant } = cfg();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const pollMs = opts.pollMs ?? 3_000;
  const since = opts.since ?? Math.floor(Date.now() / 1000) - 60;
  const deadline = Date.now() + timeoutMs;
  const wanted = address.toLowerCase();

  while (Date.now() < deadline) {
    const { data } = await nylasGet<{ data: NylasMessage[] }>(
      `/v3/grants/${grant}/messages?limit=25`,
    );
    const match = data.find(
      (m) =>
        (m.date ?? 0) >= since - 5 &&
        (m.to ?? []).some((t) => (t.email ?? "").toLowerCase() === wanted),
    );
    if (match) {
      if (match.body) return match;
      const { data: full } = await nylasGet<{ data: NylasMessage }>(
        `/v3/grants/${grant}/messages/${match.id}`,
      );
      return full;
    }
    await sleep(pollMs);
  }
  throw new Error(
    `No email to ${address} within ${timeoutMs}ms — confirm email verification ` +
      `is ON and that Neon Auth can deliver to the .nylas.email domain.`,
  );
}

/**
 * Extract the account-verification link from a message. Better Auth / Neon Auth
 * links point at the auth endpoint and carry a token, so prefer those; fall back
 * to the first absolute URL. Confirm the exact shape on the first live run.
 */
export function extractVerificationLink(msg: NylasMessage): string | null {
  const source = msg.body ?? msg.snippet ?? "";
  const links = Array.from(
    source.matchAll(/https?:\/\/[^\s"'<>)]+/gi),
    (m) => m[0].replace(/&amp;/g, "&"),
  );
  if (links.length === 0) return null;
  return links.find((l) => /verify|verification|token=/i.test(l)) ?? links[0] ?? null;
}

/** Best-effort delete (keeps the shared inbox clean between runs). */
export async function deleteMessage(id: string): Promise<void> {
  const { apiKey, grant } = cfg();
  await fetch(`${API_BASE}/v3/grants/${grant}/messages/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});
}
