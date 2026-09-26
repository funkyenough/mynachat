import Link from "next/link";
import { notFound } from "next/navigation";
import WaitlistButton from "@/components/WaitlistButton";
import { currentAccount, memberOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMethod, groupsForCode } from "@/lib/groups";
import { childrenOf, getCode, trail } from "@/lib/icd10";

export const dynamic = "force-dynamic";

export default async function DiseasePage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code);
  const entry = getCode(code);
  if (!entry || entry.kind < 2) notFound();
  const path = trail(code);
  const subs = entry.kind === 2 ? childrenOf(code) : [];
  const groups = groupsForCode(code);
  const me = await currentAccount();
  const memberships = me ? await Promise.all(groups.map((g) => memberOf(me.id, g.id))) : [];

  const db = await getDb();
  const waitCount = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM waitlist WHERE icd_code = ?", [code])?.n ?? 0;
  const waiting = me ? !!db.get("SELECT 1 AS x FROM waitlist WHERE icd_code = ? AND account_id = ?", [code, me.id]) : false;

  return (
    <>
      <nav className="crumbs small muted">
        <Link href="/search">検索 / Search</Link>
        {path.slice(0, -1).map((p) => (
          <span key={p.code}> › {p.kind >= 2 ? <Link href={`/disease/${p.code}`}>{p.code}</Link> : p.ja.replace(/（.*）$/, "")}</span>
        ))}
      </nav>
      <h1><span className="code big">{entry.code}</span> {entry.ja}</h1>
      {entry.en && <p className="muted">{entry.en}</p>}

      {groups.length > 0 ? (
        <section className="stack">
          <h2>コミュニティ / Community</h2>
          {groups.map((g, i) => (
            <div className="card stack" key={g.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{g.name.ja}</strong> <span className="muted">/ {g.name.en}</span>
                  {g.description && <div className="small muted">{g.description.ja} / {g.description.en}</div>}
                </div>
                {memberships[i] ? (
                  <Link className="button" href={`/groups/${g.id}`}>掲示板へ / Open board</Link>
                ) : (
                  <Link className="button" href={`/groups/${g.id}/join`}>参加する / Join</Link>
                )}
              </div>
              <div className="small muted">
                証明方法 / Proof: {g.methods.map((m) => getMethod(m).name.ja).join("、")}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="card stack">
          <h2 className="flush">まだコミュニティはありません / No verified community yet</h2>
          <p className="small muted">
            この病名を確認できる証明方法がまだありません。電子カルテ情報共有サービス（2027年本格運用予定）で傷病名そのものを証明できるようになる予定です。希望者が集まった病名から、処方薬や指定難病による証明でグループを開設します。
            <br />
            There is no way to verify this condition yet. Diagnosis records (EHR sharing service, planned for 2027) will make
            it provable directly. Until then, we open groups where demand is highest and a prescription or 指定難病 proof works.
          </p>
          {me ? (
            <WaitlistButton code={code} on={waiting} count={waitCount} />
          ) : (
            <p className="small">
              <Link href={`/login?next=/disease/${code}`}>ログイン / Log in</Link> して希望を登録 / to register interest · {waitCount} 人が希望 / interested
            </p>
          )}
        </section>
      )}

      {subs.length > 0 && (
        <section>
          <h2>詳細分類 / Subcategories</h2>
          <ul className="sublist">
            {subs.map((s) => (
              <li key={s.code}>
                <Link href={`/disease/${s.code}`}>
                  <span className="code">{s.code}</span> {s.ja}
                  {groupsForCode(s.code).length > 0 && <span className="badge">コミュニティ / Community</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
