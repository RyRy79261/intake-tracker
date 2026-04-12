import { auth } from "@/lib/neon-auth";

/**
 * Catch-all Neon Auth handler.
 *
 * This single route file proxies every Neon Auth endpoint through a single
 * mount point: `/api/auth/sign-in/email`, `/api/auth/sign-up/email`,
 * `/api/auth/sign-out`, `/api/auth/get-session`, `/api/auth/callback/google`,
 * and everything else the Neon Auth client calls.
 *
 * Implementation note: `auth.handler()` returns an object with GET/POST/PUT/
 * DELETE/PATCH handlers that expect Next.js route context shape
 * `{ params: Promise<{ path: string[] }> }`. Next 14 delivers a synchronous
 * `{ path: string[] }` as the params bag, but awaiting a plain object resolves
 * to the object itself, so the same handler works transparently on both Next 14
 * and Next 15+. The Neon Auth package declares `next>=16.0.6` as a peer dep but
 * only uses stable `next/headers` + `next/server` APIs.
 */
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
