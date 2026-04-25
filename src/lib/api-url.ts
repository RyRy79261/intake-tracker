// Resolve an API path against an optional base URL. On web (Vercel deploy)
// `NEXT_PUBLIC_API_BASE_URL` is unset, so paths stay relative. The Android
// build sets it to the deployed origin so `/api/*` calls reach the server
// when the device is online; offline they fail and callers handle the error.
const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (!BASE_URL) return path;
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
