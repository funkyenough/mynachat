// DEV ONLY (DEV_FAKE_MYNA=1): mark a pending session myna_verified without the extension/verifier.
import { config } from "@/lib/config";
import { fail, json, readJson } from "@/lib/http";
import { getSession, setSessionState } from "@/lib/sessions";

export async function POST(req: Request) {
  if (!config.devFakeMyna) return fail(404, "not found");
  const body = await readJson(req);
  const s = await getSession(body?.sessionId);
  if (!s) return fail(404, "unknown session");
  if (s.state !== "pending") return fail(409, `session is ${s.state}`);
  await setSessionState(s.id, "myna_verified", {
    evidence: JSON.stringify({ fake: true }),
    verifiedAt: new Date().toISOString(),
  });
  return json({ state: "myna_verified" });
}
