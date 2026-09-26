import Link from "next/link";
import { notFound } from "next/navigation";
import PostForm from "@/components/PostForm";
import { getThread, listReplies } from "@/lib/board";
import { fmtTime } from "@/lib/format";
import { getGroup } from "@/lib/groups";
import { currentMember } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ groupId: string; threadId: string }> }) {
  const { groupId, threadId } = await params;
  const group = getGroup(groupId);
  const thread = await getThread(Number(threadId));
  if (!group || !thread || thread.group_id !== groupId) notFound();
  const me = await currentMember(groupId);
  if (!me) notFound();

  const replies = await listReplies(thread.id);
  return (
    <>
      <p className="small"><Link href={`/groups/${groupId}`}>← {group.name.ja} / {group.name.en}</Link></p>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>{thread.title}</h1>
        <div className="small muted"><span className="pseudo">#{thread.author}</span> · {fmtTime(thread.created_at)}</div>
        {thread.body && <pre className="body">{thread.body}</pre>}
      </div>
      <h2>返信 / Replies ({replies.length})</h2>
      <div className="stack">
        {replies.map((r) => (
          <div className="card" key={r.id}>
            <div className="small muted"><span className="pseudo">#{r.author}</span> · {fmtTime(r.created_at)}</div>
            <pre className="body">{r.body}</pre>
          </div>
        ))}
      </div>
      <h2>返信する / Reply</h2>
      <PostForm url={`/api/threads/${thread.id}/replies`} />
    </>
  );
}
