import { logOut } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST() {
  await logOut();
  return json({ ok: true });
}
