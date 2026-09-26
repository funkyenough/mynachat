import { currentMember } from "@/lib/auth";
import { getReply, getThread } from "@/lib/board";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

/** Reply: {body, quoteId?} */
export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const thread = await getThread(Number((await params).threadId));
  const me = thread && !thread.deleted_at ? await currentMember(thread.group_id) : undefined;
  if (!thread || !me) return fail(404, "not found");
  const body = await readJson(req);
  const text = String(body?.body ?? "").trim();
  if (!text || text.length > 10000) return fail(400, "body required (max 10000 chars)");
  let quoteId: number | null = null;
  if (body?.quoteId != null) {
    const q = await getReply(Number(body.quoteId));
    if (!q || q.thread_id !== thread.id) return fail(400, "quoted reply is not in this thread");
    quoteId = q.id;
  }
  const db = await getDb();
  const id = db.run("INSERT INTO replies (thread_id, member_id, body, quote_id, created_at) VALUES (?, ?, ?, ?, ?)", [
    thread.id, me.id, text, quoteId, Date.now(),
  ]);
  return json({ id });
}
