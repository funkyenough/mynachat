import Link from "next/link";
import { notFound } from "next/navigation";
import Board from "@/components/Board";
import { currentAccount, memberOf } from "@/lib/auth";
import { listThreads } from "@/lib/board";
import { getDb } from "@/lib/db";
import { getCode } from "@/lib/icd10";
import { getGroup, getMethod } from "@/lib/groups";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getGroup(groupId);
  if (!group) notFound();
  const me = await currentAccount();
  const member = me ? await memberOf(me.id, groupId) : undefined;
  const count = (await getDb()).get<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE group_id = ?", [groupId])?.n ?? 0;

  return (
    <>
      <header className="group-head">
        <div>
          <h1 className="flush">{group.name.ja} <span className="muted">/ {group.name.en}</span></h1>
          <div className="row small muted">
            {group.icd10.map((c) => (
              <Link key={c} href={`/disease/${c}`} className="code" title={getCode(c)?.ja}>{c}</Link>
            ))}
            <span>👥 {count} 人のメンバー / members</span>
          </div>
        </div>
        {member && (
          <div className="small muted right">
            あなたの表示名 / You are
            <br />
            <span className="pseudo">{member.handle}</span>
          </div>
        )}
      </header>

      {member ? (
        <Board groupId={groupId} initial={await listThreads(groupId, member.id)} />
      ) : (
        <div className="card stack">
          <p>
            🔒 この掲示板はメンバーだけが読めます。マイナポータルのデータで参加資格を証明すると参加できます。
            <br />
            This board is for members only. Join by proving eligibility from your own Myna Portal data.
          </p>
          {group.description && <p className="small muted">{group.description.ja} / {group.description.en}</p>}
          <p className="small muted">証明方法 / Proof: {group.methods.map((m) => getMethod(m).name.ja).join("、")}</p>
          <div>
            <Link className="button" href={`/groups/${groupId}/join`}>参加する / Join</Link>
          </div>
        </div>
      )}
    </>
  );
}
