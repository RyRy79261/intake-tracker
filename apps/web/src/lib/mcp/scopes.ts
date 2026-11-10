/**
 * MCP connector scopes.
 *
 * `intake-tracker:read` covers the query tools; `intake-tracker:write` the
 * log tools. `intake-tracker:journal` is needed on top of those for the
 * medical journal: a grant approved before the connector could reach the
 * journal does not hold it, so the user approves journal access before
 * Claude reads a word. A client that names no scope (claude.ai sends none)
 * gets all three, and the consent screen lists all three. A client can still
 * ask for fewer.
 */
export const SUPPORTED_SCOPES = [
  "intake-tracker:read",
  "intake-tracker:write",
  "intake-tracker:journal",
] as const;
export type Scope = (typeof SUPPORTED_SCOPES)[number];

export const READ_SCOPE: Scope = "intake-tracker:read";
export const WRITE_SCOPE: Scope = "intake-tracker:write";
export const JOURNAL_SCOPE: Scope = "intake-tracker:journal";

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
