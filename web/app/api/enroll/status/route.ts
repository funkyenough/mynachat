import { fail, json } from "@/lib/http";
import { getSession, isExpired } from "@/lib/sessions";

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  const s = await getSession(sessionId);
  if (!s) return fail(404, "unknown session");
  if (s.state !== "member" && isExpired(s)) return json({ state: "failed", error: "session expired" });
  return json({ state: s.state, ...(s.error ? { error: s.error } : {}) });
}
