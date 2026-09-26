// Signs an IDKit request server-side. Only for sessions that passed the Myna step,
// and only for that session's group action.
import { signRequest } from "@worldcoin/idkit-core/signing";
import { config, joinAction } from "@/lib/config";
import { fail, json, readJson } from "@/lib/http";
import { getSession, isExpired } from "@/lib/sessions";

export async function POST(req: Request) {
  const key = process.env.RP_SIGNING_KEY;
  if (!key) return fail(500, "RP_SIGNING_KEY is not set in web/.env.local");
  const body = await readJson(req);
  const s = await getSession(body?.sessionId);
  if (!s) return fail(404, "unknown session");
  if (s.state !== "myna_verified" || isExpired(s)) return fail(409, "session is not myna_verified");

  const action = joinAction(s.group_id);
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: key, action });
  return json({ rp_id: config.rpId, action, sig, nonce, created_at: createdAt, expires_at: expiresAt });
}
