import { createHash } from "node:crypto";
import { open, unlink, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { manifest, runtime } from "../scripts/runtime.ts";
import { isRecord } from "./input.ts";
import {
  applyCommand,
  emptyState,
  tables,
  parseCommand,
  requireCondition,
  DomainError,
  type State,
  type Authority,
  type Outcome,
} from "./model.ts";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function decoded(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}
export class Store {
  private constructor(
    readonly sql: Bun.SQL,
    readonly lockPath: string,
  ) {}
  static async connect() {
    const server = await manifest();
    const sql = new Bun.SQL(`mysql://root@127.0.0.1:${server.port}/${server.database}`, {
      max: 1,
      connectionTimeout: 3,
    });
    return new Store(sql, resolve(runtime, `writer-${server.token}.lock`));
  }
  async migrate() {
    const schema = await readFile(resolve(import.meta.dir, "../schema/001.sql"), "utf8");
    for (const statement of schema
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await this.sql.unsafe(statement);
    const rows = await this.sql<unknown[]>`SELECT revision FROM store_revision WHERE id = 1`;
    if (rows.length === 0) await this.sql`INSERT INTO store_revision (id, revision) VALUES (1, 0)`;
    const [setting] = await this.sql<unknown[]>`SELECT @@dolt_transaction_commit AS enabled`;
    requireCondition(
      isRecord(setting) && (setting.enabled === 1 || setting.enabled === "1"),
      "history_disabled",
      "Dolt transaction commits must be enabled",
    );
  }
  private async load(connection: Bun.SQL): Promise<State> {
    const state = emptyState();
    const [row] = await connection<unknown[]>`SELECT revision FROM store_revision WHERE id = 1`;
    requireCondition(
      isRecord(row) &&
        (typeof row.revision === "number" || (typeof row.revision === "string" && /^\d+$/.test(row.revision))),
      "corrupt_store",
      "Missing store revision",
    );
    state.revision = Number(row.revision);
    requireCondition(
      Number.isSafeInteger(state.revision) && state.revision >= 0,
      "corrupt_store",
      "Invalid store revision",
    );
    for (const table of tables) {
      const rows = await connection.unsafe<unknown[]>(`SELECT id, payload FROM \`${table}\``);
      const target: Record<string, unknown> = state[table];
      for (const row of rows) {
        requireCondition(isRecord(row) && typeof row.id === "string", "corrupt_store", "Missing record identity");
        const payload = decoded(row.payload);
        requireCondition(
          isRecord(payload) && payload.id === row.id,
          "corrupt_store",
          "Stored identity does not match SQL row",
        );
        Object.defineProperty(target, row.id, { value: payload, enumerable: true, writable: true, configurable: true });
      }
    }
    return state;
  }
  async snapshot(): Promise<State> {
    return this.sql.begin((tx) => this.load(tx));
  }
  async execute(
    input: unknown,
    authority: Authority = "agent",
    fault?: "before-commit" | "after-commit",
  ): Promise<Outcome> {
    const command = parseCommand(input);
    const hash = createHash("sha256").update(canonical(command)).digest("hex");
    // The proof has a single writer. Never delete or steal an unknown owner's lock.
    const lock = await open(this.lockPath, "wx").catch(() => {
      throw new DomainError("writer_busy", "Another writer or an uninspected interrupted writer owns this proof");
    });
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, commandId: command.id }));
      const result = await this.sql.begin(async (tx) => {
        const before = await this.load(tx);
        const previous = before.commands[command.id];
        if (previous) {
          requireCondition(
            previous.hash === hash && previous.authority === authority,
            "command_conflict",
            "Command ID belongs to different input or authority",
          );
          return previous.outcome;
        }
        requireCondition(
          before.revision === command.expectedRevision,
          "stale_revision",
          `Expected ${command.expectedRevision}, current ${before.revision}`,
        );
        const state = structuredClone(before);
        const value = applyCommand(state, command, authority);
        state.revision++;
        const eventId = `event:${command.id}`;
        const outcome: Outcome = {
          commandId: command.id,
          revision: state.revision,
          eventIds: [eventId],
          result: value,
        };
        state.events[eventId] = {
          id: eventId,
          revision: state.revision,
          operation: command.operation,
          authority,
          payload: command.payload,
          result: value,
          recordedAt: new Date().toISOString(),
        };
        state.commands[command.id] = { id: command.id, hash, authority, outcome };
        await tx`UPDATE store_revision SET revision = ${state.revision} WHERE id = 1 AND revision = ${before.revision}`;
        for (const table of tables) {
          const after: Record<string, unknown> = state[table],
            prior: Record<string, unknown> = before[table];
          for (const [id, row] of Object.entries(after))
            if (canonical(row) !== canonical(prior[id])) {
              await tx.unsafe(
                `INSERT INTO \`${table}\` (id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
                [id, JSON.stringify(row)],
              );
            }
        }
        if (fault === "before-commit")
          throw new DomainError("injected_failure", "Injected failure before transaction commit");
        return outcome;
      });
      if (fault === "after-commit")
        throw new DomainError("response_lost", "Injected lost response after durable transaction commit");
      return result;
    } finally {
      await lock.close();
      await unlink(this.lockPath);
    }
  }
  async history() {
    return this.sql<unknown[]>`SELECT commit_hash, message, date FROM dolt_log`;
  }

  async commandHistory() {
    const rows = await this.sql<unknown[]>`
      SELECT to_commit, diff_type, to_id FROM dolt_diff_commands WHERE diff_type = 'added'
    `;
    return rows.map((row) => {
      requireCondition(
        isRecord(row) &&
          typeof row.to_commit === "string" &&
          row.diff_type === "added" &&
          typeof row.to_id === "string",
        "corrupt_store",
        "Invalid Dolt command history row",
      );
      return { to_commit: row.to_commit, diff_type: row.diff_type, to_id: row.to_id };
    });
  }
  async close() {
    await this.sql.close();
  }
}
export async function exportTables(store: Store): Promise<Record<string, unknown>> {
  const state = await store.snapshot();
  return {
    storeRevision: state.revision,
    tables: Object.fromEntries(tables.map((t) => [t, Object.values(state[t])])),
    doltHistory: await store.history(),
  };
}
