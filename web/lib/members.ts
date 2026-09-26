// Member auth: one httpOnly cookie per group ("mm_<groupId>") holding a random token.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export type Member = {
  id: number;
  group_id: string;
  pseudonym: string;
  method: string;
  joined_at: number;
};

export const cookieName = (groupId: string) => `mm_${groupId.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** Short display pseudonym from the per-group World ID nullifier. */
export const pseudonymFor = (worldNullifierDecimal: string) =>
  crypto.createHash("sha256").update(worldNullifierDecimal).digest("hex").slice(0, 8);

export const newToken = () => crypto.randomBytes(32).toString("base64url");

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 90,
};

/** The current member of `groupId`, from the request cookie, or undefined. */
export async function currentMember(groupId: string): Promise<Member | undefined> {
  const token = (await cookies()).get(cookieName(groupId))?.value;
  if (!token) return undefined;
  const db = await getDb();
  return db.get<Member>(
    `SELECT m.id, m.group_id, m.pseudonym, m.method, m.joined_at
       FROM auth_tokens t JOIN members m ON m.id = t.member_id
      WHERE t.token = ? AND m.group_id = ?`,
    [token, groupId],
  );
}
