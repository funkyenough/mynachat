// Accounts and login sessions. One account per human (World ID), logged in with passkeys.
// Group membership hangs off the account, with a separate display handle per group.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export type Account = { id: number; username: string; created_at: number };

export type Member = {
  id: number;
  account_id: number;
  group_id: string;
  handle: string;
  method: string;
  joined_at: number;
};

export const LOGIN_COOKIE = "mnd_login";

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 90,
};

export const randomId = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

/** Login name: ASCII only so it is easy to type on any device. */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
/** Per-group display handle: any letters (incl. Japanese), digits, _ . - */
export const HANDLE_RE = /^[\p{L}\p{N}_.-]{2,20}$/u;

export async function currentAccount(): Promise<Account | undefined> {
  const token = (await cookies()).get(LOGIN_COOKIE)?.value;
  if (!token) return undefined;
  const db = await getDb();
  return db.get<Account>(
    `SELECT a.id, a.username, a.created_at FROM logins l JOIN accounts a ON a.id = l.account_id WHERE l.token = ?`,
    [token],
  );
}

/** Starts a login session for `accountId` and sets the cookie. */
export async function logIn(accountId: number) {
  const db = await getDb();
  const token = randomId();
  db.run("INSERT INTO logins (token, account_id, created_at) VALUES (?, ?, ?)", [token, accountId, Date.now()]);
  (await cookies()).set(LOGIN_COOKIE, token, cookieOptions);
}

export async function logOut() {
  const jar = await cookies();
  const token = jar.get(LOGIN_COOKIE)?.value;
  if (token) (await getDb()).run("DELETE FROM logins WHERE token = ?", [token]);
  jar.delete(LOGIN_COOKIE);
}

export async function memberOf(accountId: number, groupId: string): Promise<Member | undefined> {
  const db = await getDb();
  return db.get<Member>("SELECT * FROM members WHERE account_id = ? AND group_id = ?", [accountId, groupId]);
}

/** The logged-in account's membership in `groupId`, or undefined. */
export async function currentMember(groupId: string): Promise<Member | undefined> {
  const a = await currentAccount();
  return a ? memberOf(a.id, groupId) : undefined;
}

export async function handleTaken(groupId: string, handle: string): Promise<boolean> {
  const db = await getDb();
  return !!db.get("SELECT 1 AS x FROM members WHERE group_id = ? AND handle = ?", [groupId, handle]);
}

export async function usernameTaken(username: string): Promise<boolean> {
  const db = await getDb();
  return !!db.get("SELECT 1 AS x FROM accounts WHERE username = ?", [username]);
}
