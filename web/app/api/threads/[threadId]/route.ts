import { currentMember } from "@/lib/auth";
import { getThread, threadDetail } from "@/lib/board";
import { fail, json } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const t = await getThread(Number((await params).threadId));
  const me = t ? await currentMember(t.group_id) : undefined;
  const detail = me && (await threadDetail(t!.id, me.id));
  if (!detail) return fail(404, "not found");
  return json(detail);
}
