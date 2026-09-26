// SQLite via sql.js (WASM, no native build, so it works on any Node version).
// The whole DB lives in memory and is written to DB_PATH after every write.
// Fine for a single-process hackathon server; not for multi-instance deployments.
import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlValue } from "sql.js";

const DB_PATH = path.resolve(process.cwd(), process.env.DB_PATH ?? "data/mynamedical.sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL,
  method        TEXT NOT NULL,
  state         TEXT NOT NULL,              -- pending | myna_verified | failed | member
  error         TEXT,
  evidence      TEXT,                       -- JSON from the verifier
  myna_nullifier TEXT,
  verified_at   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  world_nullifier TEXT NOT NULL,            -- decimal string (NUMERIC(78,0) semantics)
  myna_nullifier  TEXT,
  method          TEXT NOT NULL,
  pseudonym       TEXT NOT NULL,
  joined_at       INTEGER NOT NULL,
  UNIQUE (world_nullifier, action),
  UNIQUE (group_id, myna_nullifier)         -- NULLs don't collide
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   TEXT NOT NULL,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id),
  member_id  INTEGER NOT NULL REFERENCES members(id),
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_group ON threads(group_id, created_at);
CREATE INDEX IF NOT EXISTS replies_thread ON replies(thread_id, created_at);
`;

type Params = SqlValue[];
export type Row = Record<string, SqlValue>;

class Db {
  constructor(private db: Database) {}

  all<T = Row>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** Runs a write and persists. Returns last insert rowid. */
  run(sql: string, params: Params = []): number {
    this.db.run(sql, params);
    const id = Number(this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? 0);
    this.persist();
    return id;
  }

  /** Runs fn inside a transaction; persists once on commit. */
  tx<T>(fn: () => T): T {
    this.db.run("BEGIN");
    try {
      const out = fn();
      this.db.run("COMMIT");
      this.persist();
      return out;
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  /** Write without persisting (for use inside tx). */
  exec(sql: string, params: Params = []): number {
    this.db.run(sql, params);
    return Number(this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? 0);
  }

  private persist() {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, DB_PATH);
    // sql.js export() reopens the connection internally, which resets pragmas.
    this.db.run("PRAGMA foreign_keys = ON");
  }
}

async function open(): Promise<Db> {
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
  });
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const raw = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON");
  raw.exec(SCHEMA);
  return new Db(raw);
}

// Survive Next dev hot reloads: one instance per process.
const g = globalThis as unknown as { __mynaDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  return (g.__mynaDb ??= open());
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/.test(e.message);
}
