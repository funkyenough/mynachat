// DEBUG (WLD_DEBUG=1): the browser reports failed or timed-out World ID requests here, with
// IDKit's debug report (already redacted client-side), so they can be read in the server log.
import { fail, json } from "@/lib/http";

export async function POST(req: Request) {
  if (process.env.WLD_DEBUG !== "1") return fail(404, "not found");
  const text = (await req.text()).slice(0, 20_000);
  console.warn(`[world-id debug] ${text}`);
  return json({ ok: true });
}
