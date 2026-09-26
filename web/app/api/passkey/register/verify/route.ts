import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isUniqueViolation } from "@/lib/db";
import { logIn } from "@/lib/auth";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSignup, takeChallenge } from "@/lib/signups";

export async function POST(req: Request) {
  const body = await readJson(req);
  const ch = await takeChallenge(body?.challengeId, "register");
  if (!ch) return fail(409, "passkey request expired, try again");

  let v;
  try {
    v = await verifyRegistrationResponse({
      response: body?.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: config.webauthnOrigin,
      expectedRPID: config.webauthnRpId,
      requireUserVerification: false,
    });
  } catch (e) {
    return fail(400, e instanceof Error ? e.message : "passkey verification failed");
  }
  if (!v.verified) return fail(400, "passkey verification failed");
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;

  const db = await getDb();
  let accountId: number;
  try {
    accountId = db.tx(() => {
      let id = ch.data.accountId as number | null;
      if (ch.data.signupId) {
        const s = db.get<{ state: string; world_nullifier: string; world_session_id: string | null }>(
          "SELECT state, world_nullifier, world_session_id FROM signups WHERE id = ?", [ch.data.signupId]);
        if (s?.state !== "human") throw new Error("signup already used");
        if (!id) {
          id = db.exec(
            `INSERT INTO accounts (username, world_nullifier, world_session_id, webauthn_user_id, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [ch.data.username, s.world_nullifier, s.world_session_id, ch.data.userId, Date.now()],
          );
        }
        db.exec("UPDATE signups SET state = 'done', account_id = ? WHERE id = ?", [id, ch.data.signupId]);
      }
      db.exec(
        `INSERT INTO passkeys (id, account_id, public_key, counter, transports, device_type, backed_up, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          credential.id, id!, Buffer.from(credential.publicKey).toString("base64url"), credential.counter,
          JSON.stringify(credential.transports ?? []), credentialDeviceType, credentialBackedUp ? 1 : 0, Date.now(),
        ],
      );
      return id!;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "username or passkey already registered");
    return fail(409, e instanceof Error ? e.message : "could not save passkey");
  }
  if (ch.data.signupId) await logIn(accountId);
  return json({ ok: true });
}
