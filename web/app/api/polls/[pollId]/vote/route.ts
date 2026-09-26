// Secret-ballot vote: {optionId, idkitResult}. The World ID proof for "poll-<id>" is bound to the
// option by its signal. Only the per-poll nullifier is stored, never the member, so the server
// counts one vote per human without recording who voted for what.
import { currentMember } from "@/lib/auth";
import { pollAction } from "@/lib/config";
import { getDb, isUniqueViolation } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { verifyWorldId } from "@/lib/worldid";

export async function POST(req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const pollId = Number((await params).pollId);
  const body = await readJson(req);
  const optionId = Number(body?.optionId);
  const db = await getDb();
  const opt = db.get<{ group_id: string }>(
    `SELECT t.group_id FROM poll_options o JOIN polls p ON p.id = o.poll_id JOIN threads t ON t.id = p.thread_id
      WHERE o.id = ? AND o.poll_id = ?`,
    [optionId, pollId],
  );
  if (!opt || !(await currentMember(opt.group_id))) return fail(404, "poll not found");

  const check = await verifyWorldId(body?.idkitResult, pollAction(pollId), `vote:${optionId}`);
  if (!check.ok) return fail(check.status, check.error, check.extra);
  try {
    db.run("INSERT INTO poll_votes (poll_id, world_nullifier, option_id) VALUES (?, ?, ?)", [pollId, check.nullifier, optionId]);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "you already voted in this poll");
    throw e;
  }
  return json({ ok: true });
}
