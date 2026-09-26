import crypto from "node:crypto";
import { SESSION_TTL_MS } from "./config";
import { getDb } from "./db";

export type SessionState = "pending" | "myna_verified" | "failed" | "member";

export type Session = {
  id: string;
  group_id: string;
  method: string;
  state: SessionState;
  error: string | null;
  myna_nullifier: string | null;
  created_at: number;
};

export async function createSession(groupId: string, method: string): Promise<string> {
  const db = await getDb();
  const id = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.run(
    "INSERT INTO sessions (id, group_id, method, state, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
    [id, groupId, method, now, now],
  );
  return id;
}

export async function getSession(id: string): Promise<Session | undefined> {
  if (!id || typeof id !== "string") return undefined;
  const db = await getDb();
  return db.get<Session>("SELECT * FROM sessions WHERE id = ?", [id]);
}

export const isExpired = (s: Session) => Date.now() - s.created_at > SESSION_TTL_MS;

export async function setSessionState(
  id: string,
  state: SessionState,
  extra: { error?: string | null; evidence?: string | null; mynaNullifier?: string | null; verifiedAt?: string | null } = {},
) {
  const db = await getDb();
  db.run(
    `UPDATE sessions SET state = ?, error = ?, evidence = COALESCE(?, evidence),
       myna_nullifier = COALESCE(?, myna_nullifier), verified_at = COALESCE(?, verified_at), updated_at = ?
     WHERE id = ?`,
    [state, extra.error ?? null, extra.evidence ?? null, extra.mynaNullifier ?? null, extra.verifiedAt ?? null, Date.now(), id],
  );
}

/** True if some member of the group already enrolled with this Myna nullifier. */
export async function mynaNullifierTaken(groupId: string, mynaNullifier: string): Promise<boolean> {
  const db = await getDb();
  return !!db.get("SELECT 1 AS x FROM members WHERE group_id = ? AND myna_nullifier = ?", [groupId, mynaNullifier]);
}
