import Link from "next/link";
import { notFound } from "next/navigation";
import PostForm from "@/components/PostForm";
import { listThreads } from "@/lib/board";
import { fmtTime } from "@/lib/format";
import { getGroup } from "@/lib/groups";
import { currentMember } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getGroup(groupId);
  if (!group) notFound();
  const me = await currentMember(groupId);

  return (
    <>
      <p className="small"><Link href="/">← グループ一覧 / Groups</Link></p>
      <h1>{group.name.ja} / {group.name.en}</h1>
      {!me ? (
        <div className="card">
          <p>この掲示板はメンバーのみ閲覧できます。<br />This board is visible to members only.</p>
          <Link className="button" href={`/groups/${groupId}/join`}>参加する / Join</Link>
        </div>
      ) : (
        <Board groupId={groupId} pseudonym={me.pseudonym} />
      )}
    </>
  );
}

async function Board({ groupId, pseudonym }: { groupId: string; pseudonym: string }) {
  const threads = await listThreads(groupId);
  return (
    <>
      <p className="muted small">あなたの匿名 ID / Your pseudonym: <span className="pseudo">#{pseudonym}</span></p>
      <h2>新しいスレッド / New thread</h2>
      <PostForm url={`/api/groups/${groupId}/threads`} withTitle />
      <h2>スレッド / Threads</h2>
      {threads.length === 0 && <p className="muted">まだ投稿はありません / No threads yet.</p>}
      <div className="stack">
        {threads.map((t) => (
          <div className="card" key={t.id}>
            <Link href={`/groups/${groupId}/threads/${t.id}`}><strong>{t.title}</strong></Link>
            <div className="small muted">
              <span className="pseudo">#{t.author}</span> · {fmtTime(t.created_at)} · 返信 {t.reply_count} replies
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
