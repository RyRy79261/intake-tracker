const STORAGE_KEY = "capacitor_auth_token";

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

let _token: string | null = null;

export function saveAuthToken(token: string): void {
  _token = token;
  storage()?.setItem(STORAGE_KEY, token);
}

export function getAuthToken(): string | null {
  if (_token) return _token;
  _token = storage()?.getItem(STORAGE_KEY) ?? null;
  return _token;
}

export function clearAuthToken(): void {
  _token = null;
  storage()?.removeItem(STORAGE_KEY);
}

export function isCapacitorMode(): boolean {
  return !!process.env.NEXT_PUBLIC_API_BASE_URL;
}

/**
 * Persist a failed API call to the in-app error log.
 *
 * Most callers catch API failures and turn them into toasts, so without this
 * a broken AI key (402 / 400) never reaches the debug error capture. Routed
 * through error-log-service via a dynamic import so this module doesn't pull
 * Dexie into every fetch site. Fire-and-forget — never blocks or throws.
 */
function captureFailure(detail: string): void {
  void import("./error-log-service")
    .then((m) => m.logError("api-error", { message: detail }))
    .catch(() => undefined);
}

async function describeResponse(response: Response, method: string, path: string): Promise<string> {
  let suffix = "";
  try {
    const body = (await response.clone().json()) as { error?: unknown; code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    const error = typeof body.error === "string" ? body.error : "";
    if (code) suffix += ` ${code}`;
    if (error) suffix += `: ${error}`;
  } catch {
    // Non-JSON body — status alone is still useful.
  }
  return `${method} ${path} → ${response.status}${suffix}`.slice(0, 500);
}

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const url = `${baseUrl}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();

  // Capacitor mode attaches the Bearer token; web mode passes init through
  // untouched (cookies carry the session).
  let finalInit = init;
  if (baseUrl) {
    const token = getAuthToken();
    const headers = new Headers(init?.headers);
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    finalInit = { ...init, headers };
  }

  let response: Response;
  try {
    response = await fetch(url, finalInit);
  } catch (err) {
    captureFailure(
      `${method} ${path} → network error: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }

  if (!response.ok) {
    captureFailure(await describeResponse(response, method, path));
  }
  return response;
}
