/**
 * MCP connector scopes.
 *
 * `intake-tracker:read` covers the query tools; `intake-tracker:write` the
 * log tools. A client that names no scope (claude.ai sends none) gets both,
 * and the consent screen lists both. A client can still ask for read alone.
 */
export const SUPPORTED_SCOPES = ["intake-tracker:read", "intake-tracker:write"] as const;
export type Scope = (typeof SUPPORTED_SCOPES)[number];

export const READ_SCOPE: Scope = "intake-tracker:read";
export const WRITE_SCOPE: Scope = "intake-tracker:write";

/** Granted when the request names no supported scope. */
export const DEFAULT_SCOPES: readonly Scope[] = SUPPORTED_SCOPES;

export function parseScopeString(scope: string | null | undefined): Scope[] {
  if (!scope) return [...DEFAULT_SCOPES];
  const requested = scope.split(/\s+/).filter(Boolean);
  const allowed = requested.filter((s): s is Scope =>
    (SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  return allowed.length > 0 ? allowed : [...DEFAULT_SCOPES];
}

export function serialiseScopes(scopes: Scope[]): string {
  return scopes.join(" ");
}

export function hasScope(granted: string, required: Scope): boolean {
  return granted.split(/\s+/).includes(required);
}
