"use client";

import { Plug, Unplug } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@intake/ui/button";
import { useToast } from "@intake/ui/use-toast";
import { useAuth } from "@/components/auth-guard";
import { apiFetch } from "@/lib/api-fetch";

interface McpConnection {
  clientId: string;
  clientName: string;
  tokenCount: number;
  connectedAt: number;
  lastUsedAt: number | null;
}

const CONNECTIONS_QUERY_KEY = ["user", "mcp-connections"] as const;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Settings → Privacy & Security: the Claude connectors (MCP clients) that can
 * read this account, and a way to cut them off. Disconnecting revokes the
 * grant's access and refresh tokens server-side, so the client loses access
 * on its next request and has to be re-authorized.
 */
export function McpConnectionsSection() {
  const { authenticated } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: async () =>
      asJson<{ connections: McpConnection[] }>(
        await apiFetch("/api/mcp/connections"),
      ),
    enabled: authenticated,
  });

  const disconnect = useMutation({
    mutationFn: async (clientId?: string) =>
      asJson<{ revoked: number }>(
        await apiFetch(
          clientId
            ? `/api/mcp/connections?clientId=${encodeURIComponent(clientId)}`
            : "/api/mcp/connections",
          { method: "DELETE" },
        ),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      toast({ title: "Disconnected", description: "The connector can no longer read your data." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't disconnect", description: err.message, variant: "destructive" });
    },
  });

  const connections = data?.connections ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <Plug className="w-4 h-4" />
        <h3 className="font-semibold">Claude connections</h3>
      </div>
      {!authenticated ? (
        <p className="text-sm text-muted-foreground">
          Sign in to manage Claude connections.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Claude connector is connected.
        </p>
      ) : (
        <div className="p-3 rounded-lg border space-y-3">
          {connections.map((c) => (
            <div key={c.clientId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  Connected {formatDate(c.connectedAt)}
                  {c.lastUsedAt ? ` · last used ${formatDate(c.lastUsedAt)}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                aria-label={`Disconnect ${c.clientName}`}
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate(c.clientId)}
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            </div>
          ))}
          {connections.length > 1 && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate(undefined)}
            >
              Disconnect all
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Connected clients get read-only access to your synced data.
      </p>
    </div>
  );
}
