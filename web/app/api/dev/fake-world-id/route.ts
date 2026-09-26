// DEV ONLY (DEV_FAKE_WORLD_ID=1): stand in for World App with a random nullifier, so the
// flows can be tried without it. Every call is a "new human".
//   {purpose:"account", signupId}          completes both World ID steps of signup
//   {purpose:"recover", recoveryId}        passes the World ID step of account recovery
//   {purpose:"poll", pollId, optionId}     casts a vote
import crypto from "node:crypto";
import { currentMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getSignup } from "@/lib/signups";

export async function POST(req: Request) {
  if (process.env.DEV_FAKE_WORLD_ID !== "1") return fail(404, "not found");
  const body = await readJson(req);
  const nullifier = BigInt(`0x${crypto.randomBytes(31).toString("hex")}`).toString(10);
  const db = await getDb();
  if (body?.purpose === "account") {
    const s = await getSignup(body.signupId);
    if (!s || s.state !== "pending" || s.account_id) return fail(409, "signup expired, start again");
    // Stands in for both World ID steps of signup: the "account" proof and the recovery session.
    const session = `session_${crypto.randomBytes(16).toString("hex")}`;
    db.run("UPDATE signups SET state = 'human', world_nullifier = ?, world_session_id = ? WHERE id = ?", [nullifier, session, s.id]);
    return json({ ok: true });
  }
  if (body?.purpose === "recover") {
    const s = await getSignup(body.recoveryId);
    if (!s || s.state !== "pending" || !s.account_id) return fail(409, "recovery expired, start again");
    db.run("UPDATE signups SET state = 'human' WHERE id = ?", [s.id]);
    return json({ ok: true });
  }
  if (body?.purpose === "poll") {
    const opt = db.get<{ group_id: string }>(
      `SELECT t.group_id FROM poll_options o JOIN polls p ON p.id = o.poll_id JOIN threads t ON t.id = p.thread_id
        WHERE o.id = ? AND o.poll_id = ?`,
      [Number(body.optionId), Number(body.pollId)],
    );
    if (!opt || !(await currentMember(opt.group_id))) return fail(404, "poll not found");
    db.run("INSERT INTO poll_votes (poll_id, world_nullifier, option_id) VALUES (?, ?, ?)", [Number(body.pollId), nullifier, Number(body.optionId)]);
    return json({ ok: true });
  }
  return fail(400, "unknown purpose");
}
