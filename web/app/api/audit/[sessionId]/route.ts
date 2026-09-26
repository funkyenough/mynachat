import fs from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/sessions";
import { fail, json } from "@/lib/http";

// Audit data for one enrollment session: the web app's record plus the verifier's
// audit file (same machine). The prover's view never reaches the server; the audit
// page gets it from the extension directly.
//
// Local demo only: disabled unless AUDIT_ENABLED=1 or running `next dev`.
const enabled = () => process.env.AUDIT_ENABLED === "1" || process.env.NODE_ENV === "development";
const auditDir = () => process.env.VERIFIER_AUDIT_DIR ?? path.join(process.cwd(), "..", "verifier", "audit");

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!enabled()) return fail(404, "not found");
  const { sessionId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) return fail(400, "bad session id");

  const session = await getSession(sessionId);
  let verifier: unknown = null;
  try {
    verifier = JSON.parse(await fs.readFile(path.join(auditDir(), `${sessionId}.json`), "utf8"));
  } catch {
    verifier = null;
  }
  if (!session && !verifier) return fail(404, "unknown session");
  return json({ session: session ?? null, verifier });
}
