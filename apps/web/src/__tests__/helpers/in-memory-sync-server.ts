/**
 * An in-memory sync server for tests: the transport port of the sync engine
 * (`SyncTransport`), answering pushes and pulls the way `/api/sync/push` and
 * `/api/sync/pull` do, with the same conflict rules (lib/sync-protocol.ts).
 *
 * It keeps one account's rows per table, stamps every write with a
 * `serverUpdatedAt` for the pull cursor, and pages pulls by
 * `(serverUpdatedAt, id)`. It skips what the real routes do outside the
 * protocol: auth, zod validation, FK checks.
 */
import { resolvePush, resolveTombstone, type SyncRow } from "@/lib/sync-protocol";
import type { SyncTransport, PullRequestBody } from "@/lib/sync-engine";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";

type StoredRow = SyncRow & { updatedAt: number; serverUpdatedAt: number };

const PAGE = 500;
const STUB_KEYS = new Set(["id", "updatedAt", "deletedAt"]);

export interface InMemorySyncServer {
  transport: SyncTransport;
  /** The server's rows of one table (without the server stamp). */
  rows(tableName: string): SyncRow[];
}

export function createInMemorySyncServer(now: () => number = Date.now): InMemorySyncServer {
  const tables = new Map<string, Map<string, StoredRow>>();
  let lastStamp = 0;
  const stamp = () => (lastStamp = Math.max(now(), lastStamp + 1));
  const tableOf = (name: string) => {
    let t = tables.get(name);
    if (!t) tables.set(name, (t = new Map()));
    return t;
  };
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  const transport: SyncTransport = {
    async push({ ops }) {
      const serverNow = now();
      const accepted: Array<{ queueId: number; serverUpdatedAt: number }> = [];
      for (const op of ops) {
        const table = tableOf(op.tableName);
        const row = op.row as SyncRow & { updatedAt: number };
        const server = table.get(row.id);
        const isStub =
          op.op === "delete" && Object.keys(row).every((k) => STUB_KEYS.has(k));
        if (isStub) {
          const d = resolveTombstone({
            stub: { updatedAt: row.updatedAt, deletedAt: row.deletedAt as number },
            server,
            serverNow,
          });
          if (d.kind === "keep") {
            accepted.push({ queueId: op.queueId, serverUpdatedAt: d.ackUpdatedAt });
          } else {
            table.set(row.id, {
              ...server!,
              deletedAt: d.deletedAt,
              updatedAt: d.updatedAt,
              serverUpdatedAt: stamp(),
            });
            accepted.push({ queueId: op.queueId, serverUpdatedAt: d.updatedAt });
          }
          continue;
        }
        const d = resolvePush({ tableName: op.tableName, incoming: row, server, serverNow });
        if (d.kind === "keep") {
          accepted.push({ queueId: op.queueId, serverUpdatedAt: d.ackUpdatedAt });
          continue;
        }
        table.set(row.id, {
          ...(d.row as SyncRow),
          id: row.id,
          updatedAt: d.updatedAt,
          serverUpdatedAt: stamp(),
        });
        accepted.push({ queueId: op.queueId, serverUpdatedAt: d.updatedAt });
      }
      return json({ accepted, rejected: [] });
    },

    async pull({ cursors }: PullRequestBody) {
      const serverTime = now();
      const result: Record<string, unknown> = {};
      for (const tableName of TABLE_PUSH_ORDER) {
        if (tableName === "auditLogs") continue; // The pull route skips them too.
        const cursor = cursors[tableName] ?? { updatedAt: 0, id: "" };
        const rows = [...tableOf(tableName).values()]
          .filter(
            (r) =>
              r.serverUpdatedAt > cursor.updatedAt ||
              (r.serverUpdatedAt === cursor.updatedAt && r.id > cursor.id),
          )
          .sort((a, b) => a.serverUpdatedAt - b.serverUpdatedAt || a.id.localeCompare(b.id));
        const page = rows.slice(0, PAGE);
        const last = page[page.length - 1];
        result[tableName] = {
          rows: page.map(({ serverUpdatedAt: _s, ...r }) => r),
          hasMore: rows.length > PAGE,
          ...(last && { cursor: { updatedAt: last.serverUpdatedAt, id: last.id } }),
        };
      }
      return json({ result, serverTime });
    },
  };

  return {
    transport,
    rows: (tableName) =>
      [...tableOf(tableName).values()].map(({ serverUpdatedAt: _s, ...r }) => r as SyncRow),
  };
}
