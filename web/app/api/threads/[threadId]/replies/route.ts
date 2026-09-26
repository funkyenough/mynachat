import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { currentMember } from "@/lib/members";
import { getThread, listReplies } from "@/lib/board";

type Ctx = { params: Promise<{ threadId: string }> };

async function load(threadId: string) {
  const thread = await getThread(Number(threadId));
  const me = thread ? await currentMember(thread.group_id) : undefined;
  return { thread, me };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { thread, me } = await load((await params).threadId);
  if (!thread || !me) return fail(404, "not found");
  return json({ thread, replies: await listReplies(thread.id) });
}

export async function POST(req: Request, { params }: Ctx) {
  const { thread, me } = await load((await params).threadId);
  if (!thread || !me) return fail(404, "not found");
  const body = await readJson(req);
  const text = String(body?.body ?? "").trim();
  if (!text || text.length > 10000) return fail(400, "body required (max 10000 chars)");
  const db = await getDb();
  const id = db.run("INSERT INTO replies (thread_id, member_id, body, created_at) VALUES (?, ?, ?, ?)", [
    thread.id, me.id, text, Date.now(),
  ]);
  return json({ id });
}
