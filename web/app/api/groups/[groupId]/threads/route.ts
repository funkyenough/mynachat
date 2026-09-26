import { currentMember } from "@/lib/auth";
import { listThreads } from "@/lib/board";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ groupId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const me = await currentMember(groupId);
  if (!me) return fail(403, "members only");
  return json({ threads: await listThreads(groupId, me.id) });
}

/** New thread, optionally with a poll: {title, body, poll?: string[]} */
export async function POST(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const me = await currentMember(groupId);
  if (!me) return fail(403, "members only");
  const body = await readJson(req);
  const title = String(body?.title ?? "").trim();
  const text = String(body?.body ?? "").trim();
  if (!title || title.length > 200) return fail(400, "title required (max 200 chars)");
  if (text.length > 10000) return fail(400, "body too long (max 10000 chars)");
  const options = Array.isArray(body?.poll) ? body.poll.map((o: unknown) => String(o).trim()).filter(Boolean) : [];
  if (options.length === 1 || options.length > 8 || options.some((o: string) => o.length > 100)) {
    return fail(400, "a poll needs 2–8 options (max 100 chars each)");
  }
  const db = await getDb();
  const id = db.tx(() => {
    const id = db.exec("INSERT INTO threads (group_id, member_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)", [
      groupId, me.id, title, text, Date.now(),
    ]);
    if (options.length) {
      const pollId = db.exec("INSERT INTO polls (thread_id) VALUES (?)", [id]);
      options.forEach((o: string, i: number) =>
        db.exec("INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)", [pollId, o, i]));
    }
    return id;
  });
  return json({ id });
}
