// SQLite via sql.js (WASM, no native build, so it works on any Node version).
// The whole DB lives in memory and is written to DB_PATH after every write.
// Fine for a single-process hackathon server; not for multi-instance deployments.
import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlValue } from "sql.js";

const DB_PATH = path.resolve(process.cwd(), process.env.DB_PATH ?? "data/mynachat.sqlite");

const SCHEMA = `
-- One account per human: world_nullifier is the World ID nullifier for the "account" action.
CREATE TABLE IF NOT EXISTS accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- login name, never shown on boards
  world_nullifier  TEXT NOT NULL UNIQUE,                  -- decimal string
  webauthn_user_id TEXT NOT NULL,                         -- base64url user handle for passkeys
  created_at       INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS passkeys (
  id           TEXT PRIMARY KEY,                          -- credential id, base64url
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  public_key   TEXT NOT NULL,                             -- COSE key, base64url
  counter      INTEGER NOT NULL,
  transports   TEXT,                                      -- JSON array
  device_type  TEXT,
  backed_up    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE TABLE IF NOT EXISTS logins (
  token      TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL
);
-- Signup attempts: World ID first, then a passkey.
CREATE TABLE IF NOT EXISTS signups (
  id              TEXT PRIMARY KEY,
  state           TEXT NOT NULL,                          -- pending | human | done
  world_nullifier TEXT,
  account_id      INTEGER REFERENCES accounts(id),        -- the account the signup created
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,                               -- register | login
  challenge  TEXT NOT NULL,
  data       TEXT,                                        -- JSON: signupId, username, userId, accountId
  created_at INTEGER NOT NULL
);
-- Myna proof sessions, one per group join attempt.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  group_id      TEXT NOT NULL,
  method        TEXT NOT NULL,
  handle        TEXT NOT NULL,
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
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  group_id        TEXT NOT NULL,
  handle          TEXT NOT NULL COLLATE NOCASE,  -- per-group display name
  method          TEXT NOT NULL,
  myna_nullifier  TEXT,
  joined_at       INTEGER NOT NULL,
  UNIQUE (account_id, group_id),
  UNIQUE (group_id, handle),
  UNIQUE (group_id, myna_nullifier)         -- NULLs don't collide
);
CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   TEXT NOT NULL,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id),
  member_id  INTEGER NOT NULL REFERENCES members(id),
  body       TEXT NOT NULL,
  quote_id   INTEGER REFERENCES replies(id),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS reactions (
  kind      TEXT NOT NULL,                  -- t (thread) | r (reply)
  post_id   INTEGER NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id),
  emoji     TEXT NOT NULL,
  PRIMARY KEY (kind, post_id, member_id, emoji)
);
CREATE TABLE IF NOT EXISTS polls (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL UNIQUE REFERENCES threads(id)
);
CREATE TABLE IF NOT EXISTS poll_options (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id  INTEGER NOT NULL REFERENCES polls(id),
  label    TEXT NOT NULL,
  position INTEGER NOT NULL
);
-- Secret ballot: keyed by the per-poll World ID nullifier only, never by member.
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id         INTEGER NOT NULL REFERENCES polls(id),
  world_nullifier TEXT NOT NULL,
  option_id       INTEGER NOT NULL REFERENCES poll_options(id),
  PRIMARY KEY (poll_id, world_nullifier)
);
CREATE TABLE IF NOT EXISTS waitlist (
  icd_code   TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (icd_code, account_id)
);
-- When each member last opened each thread: drives "new" topics and unread reply counts.
CREATE TABLE IF NOT EXISTS thread_reads (
  thread_id INTEGER NOT NULL REFERENCES threads(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  read_at   INTEGER NOT NULL,
  PRIMARY KEY (thread_id, member_id)
);
CREATE INDEX IF NOT EXISTS threads_group ON threads(group_id, created_at);
CREATE INDEX IF NOT EXISTS replies_thread ON replies(thread_id, created_at);
`;

/** Tables from before accounts existed (per-group World ID members). Local dev data only. */
const PRE_ACCOUNT_TABLES = ["replies", "threads", "auth_tokens", "members", "sessions"];

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
  const cols = raw.exec("SELECT name FROM pragma_table_info('members')")[0]?.values.flat() ?? [];
  if (cols.includes("world_nullifier")) {
    for (const t of PRE_ACCOUNT_TABLES) raw.run(`DROP TABLE IF EXISTS ${t}`);
  }
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
