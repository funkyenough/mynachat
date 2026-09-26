// Signed IDKit request for one of the app's World ID actions, plus the signal to bind.
//   {purpose:"account", signupId}           -> action "account", signal = signupId
//   {purpose:"poll", pollId, optionId}      -> action "poll-<id>", signal = "vote:<optionId>"
import { currentMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ACCOUNT_ACTION, pollAction } from "@/lib/config";
import { fail, json, readJson } from "@/lib/http";
import { getSignup } from "@/lib/signups";
import { rpContext } from "@/lib/worldid";

export async function POST(req: Request) {
  const body = await readJson(req);
  let action: string, signal: string;
  if (body?.purpose === "account") {
    const s = await getSignup(body.signupId);
    if (!s || s.state !== "pending") return fail(409, "signup expired, start again");
    [action, signal] = [ACCOUNT_ACTION, s.id];
  } else if (body?.purpose === "poll") {
    const opt = (await getDb()).get<{ poll_id: number; group_id: string }>(
      `SELECT o.poll_id, t.group_id FROM poll_options o JOIN polls p ON p.id = o.poll_id
         JOIN threads t ON t.id = p.thread_id WHERE o.id = ? AND o.poll_id = ?`,
      [Number(body.optionId), Number(body.pollId)],
    );
    if (!opt || !(await currentMember(opt.group_id))) return fail(404, "poll not found");
    [action, signal] = [pollAction(opt.poll_id), `vote:${Number(body.optionId)}`];
  } else {
    return fail(400, "unknown purpose");
  }
  try {
    return json({ rpContext: rpContext(action), action, signal });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : String(e));
  }
}
