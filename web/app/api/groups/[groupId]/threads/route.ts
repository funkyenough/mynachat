import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { currentMember } from "@/lib/members";
import { listThreads } from "@/lib/board";

type Ctx = { params: Promise<{ groupId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  if (!(await currentMember(groupId))) return fail(403, "members only");
  return json({ threads: await listThreads(groupId) });
}

export async function POST(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const me = await currentMember(groupId);
  if (!me) return fail(403, "members only");
  const body = await readJson(req);
  const title = String(body?.title ?? "").trim();
  const text = String(body?.body ?? "").trim();
  if (!title || title.length > 200) return fail(400, "title required (max 200 chars)");
  if (text.length > 10000) return fail(400, "body too long (max 10000 chars)");
  const db = await getDb();
  const id = db.run("INSERT INTO threads (group_id, member_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)", [
    groupId, me.id, title, text, Date.now(),
  ]);
  return json({ id });
}
