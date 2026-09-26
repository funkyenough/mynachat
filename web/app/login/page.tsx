import Link from "next/link";
import { redirect } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import { currentAccount } from "@/lib/auth";
import { safeNext } from "@/lib/http";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next);
  const { t } = await getT();
  return (
    <div className="narrow stack">
      <h1>{t("ログイン", "Log in")}</h1>
      <div className="card stack">
        <LoginButton next={next} />
        <p className="small muted">
          {t(
            "ユーザー名もパスワードも不要です。登録した端末の Touch ID・Face ID などで確認します。",
            "No username or password: confirm with the passkey you registered (Touch ID, Face ID, your phone…).",
          )}
        </p>
      </div>
      <p className="small">
        {t("はじめての方は", "New here?")}{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`}>{t("アカウント作成", "Create an account")}</Link>
        <br />
        <span className="muted">{t("パスキーをなくした場合は", "Lost your passkey?")}</span>{" "}
        <Link href={`/recover?next=${encodeURIComponent(next)}`}>{t("World ID で復旧", "Recover with World ID")}</Link>
      </p>
    </div>
  );
}
