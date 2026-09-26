import { USERNAME_RE, usernameTaken } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!USERNAME_RE.test(u)) return json({ ok: false, reason: "3–20 characters: A–Z, 0–9, _" });
  return json(await usernameTaken(u) ? { ok: false, reason: "taken" } : { ok: true });
}
