// Signed IDKit request for one of the app's World ID proofs, plus the signal to bind.
// Uniqueness proofs (one-time per person and action):
//   {purpose:"account", signupId}         -> action "account", signal = signupId
//   {purpose:"poll", pollId, optionId}    -> action "poll-<id>", signal = "vote:<optionId>"
// Session proofs (no action; re-provable, for recognising a returning person):
//   {purpose:"link-session"}              -> create a session for the logged-in account (older accounts)
//   {purpose:"recover", recoveryId}       -> prove the account's saved session
import { currentAccount, currentMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ACCOUNT_ACTION, pollAction } from "@/lib/config";
import { fail, json, readJson } from "@/lib/http";
import { getSignup } from "@/lib/signups";
import { rpContext } from "@/lib/worldid";

type Req = {
  action?: string;
  signal: string;
  session?: "create" | "prove";
  sessionId?: string;
  variant?: { credential: "proof_of_human" | "selfie"; signal: boolean };
};

export async function POST(req: Request) {
  const body = await readJson(req);
  let r: Req;
  switch (body?.purpose) {
    case "account": {
      const s = await getSignup(body.signupId);
      if (!s || s.state !== "pending" || s.account_id) return fail(409, "signup expired, start again");
      r = { action: ACCOUNT_ACTION, signal: s.id };
      break;
    }
    case "link-session": {
      const me = await currentAccount();
      if (!me) return fail(401, "log in first");
      const has = (await getDb()).get<{ world_session_id: string | null }>(
        "SELECT world_session_id FROM accounts WHERE id = ?", [me.id]);
      if (has?.world_session_id) return fail(409, "recovery is already set up for this account");
      r = { signal: `link:${me.id}`, session: "create" };
      // WLD_DEBUG experiments: which credential, and whether to attach the signal.
      if (process.env.WLD_DEBUG === "1" && body.variant) {
        r.variant = { credential: body.variant.credential === "selfie" ? "selfie" : "proof_of_human", signal: !!body.variant.signal };
      }
      break;
    }
    case "recover": {
      const s = await getSignup(body.recoveryId);
      if (!s || s.state !== "pending" || !s.account_id) return fail(409, "recovery expired, start again");
      const a = (await getDb()).get<{ world_session_id: string | null }>(
        "SELECT world_session_id FROM accounts WHERE id = ?", [s.account_id]);
      if (!a?.world_session_id) return fail(409, "this account has no World ID recovery set up");
      r = { signal: `recover:${s.id}`, session: "prove", sessionId: a.world_session_id };
      break;
    }
    case "poll": {
      const opt = (await getDb()).get<{ poll_id: number; group_id: string }>(
        `SELECT o.poll_id, t.group_id FROM poll_options o JOIN polls p ON p.id = o.poll_id
           JOIN threads t ON t.id = p.thread_id WHERE o.id = ? AND o.poll_id = ?`,
        [Number(body.optionId), Number(body.pollId)],
      );
      if (!opt || !(await currentMember(opt.group_id))) return fail(404, "poll not found");
      r = { action: pollAction(opt.poll_id), signal: `vote:${Number(body.optionId)}` };
      break;
    }
    default:
      return fail(400, "unknown purpose");
  }
  if (r.session) {
    console.info(`[world-id] session ${r.session} requested (${body.purpose})${r.variant ? ` variant=${JSON.stringify(r.variant)}` : ""}`);
  }
  try {
    return json({ rpContext: rpContext(r.action), ...r });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : String(e));
  }
}
