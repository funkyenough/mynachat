// Passkey registration options, for one of:
//   - a new account: {signupId, username} after the World ID step
//   - recovery: {signupId} when World ID matched an existing account
//   - an extra passkey for the logged-in account: {}
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { currentAccount, randomId, USERNAME_RE, usernameTaken } from "@/lib/auth";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSignup, saveChallenge } from "@/lib/signups";

export async function POST(req: Request) {
  const body = (await readJson(req)) ?? {};
  const db = await getDb();
  let accountId: number | null = null,
    username: string,
    userId: string,
    signupId: string | null = null;

  if (body.signupId) {
    const s = await getSignup(body.signupId);
    if (!s || s.state !== "human") return fail(409, "verify with World ID first");
    signupId = s.id;
    if (s.account_id) {
      const a = db.get<{ id: number; username: string; webauthn_user_id: string }>(
        "SELECT id, username, webauthn_user_id FROM accounts WHERE id = ?",
        [s.account_id],
      );
      if (!a) return fail(404, "account not found");
      [accountId, username, userId] = [a.id, a.username, a.webauthn_user_id];
    } else {
      username = String(body.username ?? "");
      if (!USERNAME_RE.test(username)) return fail(400, "username: 3–20 characters, A–Z 0–9 _");
      if (await usernameTaken(username)) return fail(409, "username is taken");
      userId = randomId(16);
    }
  } else {
    const me = await currentAccount();
    if (!me) return fail(401, "log in first");
    const a = db.get<{ webauthn_user_id: string }>("SELECT webauthn_user_id FROM accounts WHERE id = ?", [me.id])!;
    [accountId, username, userId] = [me.id, me.username, a.webauthn_user_id];
  }

  const existing = accountId
    ? db.all<{ id: string; transports: string | null }>("SELECT id, transports FROM passkeys WHERE account_id = ?", [
        accountId,
      ])
    : [];
  const options = await generateRegistrationOptions({
    rpName: "mynachat",
    rpID: config.webauthnRpId,
    userName: username,
    userID: Buffer.from(userId, "base64url"),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const challengeId = randomId();
  await saveChallenge(challengeId, "register", options.challenge, { signupId, accountId, username, userId });
  return json({ challengeId, options });
}
