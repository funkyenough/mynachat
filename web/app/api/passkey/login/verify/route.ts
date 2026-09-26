import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { logIn } from "@/lib/auth";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { takeChallenge } from "@/lib/signups";

export async function POST(req: Request) {
  const body = await readJson(req);
  const ch = await takeChallenge(body?.challengeId, "login");
  if (!ch) return fail(409, "login request expired, try again");
  const response = body?.response;
  const db = await getDb();
  const pk = db.get<{ id: string; account_id: number; public_key: string; counter: number; transports: string | null }>(
    "SELECT id, account_id, public_key, counter, transports FROM passkeys WHERE id = ?",
    [String(response?.id ?? "")],
  );
  if (!pk) return fail(404, "unknown passkey: it may belong to a deleted account or another site");

  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: config.webauthnOrigin,
      expectedRPID: config.webauthnRpId,
      credential: {
        id: pk.id,
        publicKey: Buffer.from(pk.public_key, "base64url"),
        counter: pk.counter,
        transports: pk.transports ? JSON.parse(pk.transports) : undefined,
      },
      requireUserVerification: false,
    });
  } catch (e) {
    return fail(400, e instanceof Error ? e.message : "passkey verification failed");
  }
  if (!v.verified) return fail(400, "passkey verification failed");
  db.run("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?", [v.authenticationInfo.newCounter, Date.now(), pk.id]);
  await logIn(pk.account_id);
  return json({ ok: true });
}
