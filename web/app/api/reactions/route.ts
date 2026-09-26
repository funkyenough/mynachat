// Toggle a reaction: {kind: "t"|"r", id, emoji}
import { currentMember } from "@/lib/auth";
import { getReply, getThread, isEmoji } from "@/lib/board";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const body = await readJson(req);
  const id = Number(body?.id);
  if (!isEmoji(body?.emoji)) return fail(400, "unknown reaction");
  const post = body?.kind === "t" ? await getThread(id) : body?.kind === "r" ? await getReply(id) : undefined;
  const me = post && !post.deleted_at ? await currentMember(post.group_id) : undefined;
  if (!post || !me) return fail(404, "not found");
  const db = await getDb();
  const key = [body.kind, id, me.id, body.emoji];
  const had = db.get("SELECT 1 AS x FROM reactions WHERE kind = ? AND post_id = ? AND member_id = ? AND emoji = ?", key);
  db.run(had
    ? "DELETE FROM reactions WHERE kind = ? AND post_id = ? AND member_id = ? AND emoji = ?"
    : "INSERT INTO reactions (kind, post_id, member_id, emoji) VALUES (?, ?, ?, ?)", key);
  return json({ on: !had });
}
