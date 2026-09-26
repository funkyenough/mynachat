// Delete your own thread or reply: {kind: "t"|"r", id}. Soft delete; replies keep their place.
import { currentMember } from "@/lib/auth";
import { getReply, getThread } from "@/lib/board";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";

export async function DELETE(req: Request) {
  const body = await readJson(req);
  const id = Number(body?.id);
  const post = body?.kind === "t" ? await getThread(id) : body?.kind === "r" ? await getReply(id) : undefined;
  const me = post ? await currentMember(post.group_id) : undefined;
  if (!post || !me || post.member_id !== me.id) return fail(404, "not found");
  (await getDb()).run(`UPDATE ${body!.kind === "t" ? "threads" : "replies"} SET deleted_at = ? WHERE id = ?`, [Date.now(), id]);
  return json({ ok: true });
}
