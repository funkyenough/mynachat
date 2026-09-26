import { CHALLENGE_TTL_MS } from "./config";
import { getDb } from "./db";

export type Signup = {
  id: string;
  state: "pending" | "human" | "done";
  world_nullifier: string | null;
  account_id: number | null;
  created_at: number;
};

export async function getSignup(id: unknown): Promise<Signup | undefined> {
  if (typeof id !== "string" || !id) return undefined;
  const s = (await getDb()).get<Signup>("SELECT * FROM signups WHERE id = ?", [id]);
  return s && Date.now() - s.created_at <= CHALLENGE_TTL_MS ? s : undefined;
}

export type Challenge = { id: string; kind: "register" | "login"; challenge: string; data: Record<string, any> };

/** Reads and deletes a WebAuthn challenge (single use). */
export async function takeChallenge(id: unknown, kind: Challenge["kind"]): Promise<Challenge | undefined> {
  if (typeof id !== "string" || !id) return undefined;
  const db = await getDb();
  const row = db.get<{ id: string; kind: string; challenge: string; data: string | null; created_at: number }>(
    "SELECT * FROM challenges WHERE id = ?",
    [id],
  );
  if (!row) return undefined;
  db.run("DELETE FROM challenges WHERE id = ?", [id]);
  if (row.kind !== kind || Date.now() - row.created_at > CHALLENGE_TTL_MS) return undefined;
  return { id: row.id, kind, challenge: row.challenge, data: row.data ? JSON.parse(row.data) : {} };
}

export async function saveChallenge(id: string, kind: Challenge["kind"], challenge: string, data: Record<string, unknown>) {
  const db = await getDb();
  db.run("DELETE FROM challenges WHERE created_at < ?", [Date.now() - CHALLENGE_TTL_MS]);
  db.run("INSERT INTO challenges (id, kind, challenge, data, created_at) VALUES (?, ?, ?, ?, ?)", [
    id, kind, challenge, JSON.stringify(data), Date.now(),
  ]);
}
