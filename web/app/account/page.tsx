import Link from "next/link";
import { redirect } from "next/navigation";
import { AddPasskeyButton, LogoutButton, SetupRecoveryButton } from "@/components/AccountActions";
import { currentAccount } from "@/lib/auth";
import { worldConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { fmtTime } from "@/lib/format";
import { getGroup, getMethod } from "@/lib/groups";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentAccount();
  if (!me) redirect("/login?next=/account");
  const db = await getDb();
  const passkeys = db.all<{ id: string; device_type: string | null; backed_up: number; created_at: number; last_used_at: number | null }>(
    "SELECT id, device_type, backed_up, created_at, last_used_at FROM passkeys WHERE account_id = ? ORDER BY created_at",
    [me.id],
  );
  const recovery = !!db.get<{ world_session_id: string | null }>(
    "SELECT world_session_id FROM accounts WHERE id = ?", [me.id])?.world_session_id;
  const members = db.all<{ group_id: string; handle: string; method: string; joined_at: number }>(
    "SELECT group_id, handle, method, joined_at FROM members WHERE account_id = ? ORDER BY joined_at",
    [me.id],
  );

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="flush">👤 {me.username}</h1>
        <LogoutButton />
      </div>
      <p className="small muted">
        World ID で確認済み（1人1アカウント）· 登録日 {fmtTime(me.created_at)}
        <br />
        Verified human via World ID (one account per person) · joined {fmtTime(me.created_at)}
      </p>

      <h2>グループ / Your groups</h2>
      <p className="small muted">この一覧はあなたにだけ表示されます。 / Only you can see this list.</p>
      {members.length === 0 ? (
        <p className="muted">まだ参加していません。<Link href="/search">病名を探す / Find your condition</Link></p>
      ) : (
        <ul className="plain stack">
          {members.map((m) => {
            const g = getGroup(m.group_id);
            return (
              <li key={m.group_id} className="card row" style={{ justifyContent: "space-between" }}>
                <span>
                  <Link href={`/groups/${m.group_id}`}><strong>{g?.name.ja ?? m.group_id}</strong></Link>{" "}
                  <span className="muted small">/ {g?.name.en}</span>
                  <br />
                  <span className="small muted">
                    表示名 / name <span className="pseudo">{m.handle}</span> · {getMethod(m.method).name.ja} · {fmtTime(m.joined_at)}
                  </span>
                </span>
                <Link className="button" href={`/groups/${m.group_id}`}>掲示板 / Board</Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2>パスキー / Passkeys</h2>
      <ul className="plain stack">
        {passkeys.map((p, i) => (
          <li key={p.id} className="card small">
            🔑 パスキー {i + 1} · {p.backed_up ? "同期済み / synced" : "この端末のみ / this device only"} · 登録 / added {fmtTime(p.created_at)}
            {p.last_used_at && <> · 最終使用 / last used {fmtTime(p.last_used_at)}</>}
          </li>
        ))}
      </ul>
      <AddPasskeyButton />

      <h2>復旧 / Recovery</h2>
      {recovery ? (
        <p className="small">
          ✓ World ID で復旧できます。パスキーをなくしても、<a href="/recover">復旧ページ</a>から同じ World ID でアカウントに戻れます。
          <br />
          <span className="muted">
            Recovery is set up: if you lose your passkeys, the same World ID brings you back via the recovery page.
          </span>
        </p>
      ) : (
        <div className="stack">
          <p className="small muted">
            まだ復旧が設定されていません。パスキーをなくすとアカウントに戻れなくなります。
            <br />
            Recovery isn&apos;t set up yet. Without it, losing your passkeys means losing the account.
          </p>
          <SetupRecoveryButton world={worldConfig} />
        </div>
      )}
    </div>
  );
}
