import Link from "next/link";
import { redirect } from "next/navigation";
import { AddPasskeyButton, LogoutButton, SetupRecoveryButton } from "@/components/AccountActions";
import { currentAccount } from "@/lib/auth";
import { worldConfig } from "@/lib/config";
import { getT } from "@/lib/lang";
import { getDb } from "@/lib/db";
import { fmtTime } from "@/lib/format";
import { getGroup, getMethod } from "@/lib/groups";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentAccount();
  if (!me) redirect("/login?next=/account");
  const { lang, t } = await getT();
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
        {t("World ID で確認済み（1人1アカウント）· 登録日 ", "Verified human via World ID (one account per person) · joined ")}
        {fmtTime(me.created_at, lang)}
      </p>

      <h2>{t("グループ", "Your groups")}</h2>
      <p className="small muted">{t("この一覧はあなたにだけ表示されます。", "Only you can see this list.")}</p>
      {members.length === 0 ? (
        <p className="muted">{t("まだ参加していません。", "You haven't joined a group yet. ")}<Link href="/search">{t("病名を探す", "Find your condition")}</Link></p>
      ) : (
        <ul className="plain stack">
          {members.map((m) => {
            const g = getGroup(m.group_id);
            return (
              <li key={m.group_id} className="card row" style={{ justifyContent: "space-between" }}>
                <span>
                  <Link href={`/groups/${m.group_id}`}><strong>{g?.name[lang] ?? m.group_id}</strong></Link>
                  <br />
                  <span className="small muted">
                    {t("表示名", "name")} <span className="pseudo">{m.handle}</span> · {getMethod(m.method).name[lang]} · {fmtTime(m.joined_at, lang)}
                  </span>
                </span>
                <Link className="button" href={`/groups/${m.group_id}`}>{t("掲示板", "Board")}</Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2>{t("パスキー", "Passkeys")}</h2>
      <ul className="plain stack">
        {passkeys.map((p, i) => (
          <li key={p.id} className="card small">
            🔑 {t("パスキー", "Passkey")} {i + 1} · {p.backed_up ? t("同期済み", "synced") : t("この端末のみ", "this device only")} · {t("登録", "added")} {fmtTime(p.created_at, lang)}
            {p.last_used_at && <> · {t("最終使用", "last used")} {fmtTime(p.last_used_at, lang)}</>}
          </li>
        ))}
      </ul>
      <AddPasskeyButton />

      <h2>{t("復旧", "Recovery")}</h2>
      {recovery ? (
        <p className="small">
          {t(
            <>✓ World ID で復旧できます。パスキーをなくしても、<a href="/recover">復旧ページ</a>から同じ World ID でアカウントに戻れます。</>,
            <>✓ Recovery is set up: if you lose your passkeys, the same World ID brings you back via the <a href="/recover">recovery page</a>.</>,
          )}
        </p>
      ) : (
        <div className="stack">
          <p className="small muted">
            {t(
              "まだ復旧が設定されていません。パスキーをなくすとアカウントに戻れなくなります。",
              "Recovery isn't set up yet. Without it, losing your passkeys means losing the account.",
            )}
          </p>
          <SetupRecoveryButton world={worldConfig} />
          {worldConfig.debug && (
            <div className="card dev stack small">
              <strong>Session experiments (WLD_DEBUG)</strong>
              <span className="muted">
                Each tries creating the recovery session differently. Scan, note what World App shows, and wait up to 2
                minutes. The result is logged on the server.
              </span>
              <SetupRecoveryButton world={worldConfig} variant={{ credential: "proof_of_human", signal: false }} label="A: Proof of Human, no signal" />
              <SetupRecoveryButton world={worldConfig} variant={{ credential: "selfie", signal: false }} label="B: Selfie Check, no signal" />
              <SetupRecoveryButton world={worldConfig} variant={{ credential: "selfie", signal: true }} label="C: Selfie Check, with signal" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
