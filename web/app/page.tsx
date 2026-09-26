import Link from "next/link";
import { getMethod, listGroups } from "@/lib/groups";

export const dynamic = "force-dynamic";

export default function Home() {
  const groups = listGroups();
  return (
    <>
      <h1>グループを選ぶ / Choose a group</h1>
      <p className="muted">
        マイナポータルの自分のデータで参加資格を証明し、World ID で一人一回だけ参加できます。記録や身元はグループに開示されません。
        <br />
        Prove eligibility from your own Myna Portal data, and join once per person with World ID. Your records and
        identity are not revealed to the group.
      </p>
      <div className="stack">
        {groups.map((g) => (
          <div className="card" key={g.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{g.name.ja}</strong> <span className="muted">/ {g.name.en}</span>
                {g.description && <div className="muted small">{g.description.ja} / {g.description.en}</div>}
                <div className="small muted">
                  証明方法 / Methods: {g.methods.map((m) => getMethod(m).name.en).join(", ")}
                </div>
              </div>
              <div className="row">
                <Link href={`/groups/${g.id}`}>掲示板 / Board</Link>
                <Link className="button" href={`/groups/${g.id}/join`}>参加 / Join</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
