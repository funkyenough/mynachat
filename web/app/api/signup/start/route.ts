// Starts a signup. The World ID proof comes next, with this id as its signal.
import { randomId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json } from "@/lib/http";

export async function POST() {
  const id = randomId();
  (await getDb()).run("INSERT INTO signups (id, state, created_at) VALUES (?, 'pending', ?)", [id, Date.now()]);
  return json({ signupId: id });
}
