import Link from "next/link";
import { redirect } from "next/navigation";
import SignupFlow from "@/components/SignupFlow";
import { currentAccount } from "@/lib/auth";
import { worldConfig } from "@/lib/config";
import { safeNext } from "@/lib/http";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next);
  const { t } = await getT();
  return (
    <div className="narrow">
      <h1>{t("アカウント作成", "Create your account")}</h1>
      <p className="muted small">
        {t("すでにアカウントがありますか？", "Already have an account?")}{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("ログイン", "Log in")}</Link>
        <br />
        {t("パスキーをなくした場合は", "Lost your passkey?")}{" "}
        <Link href={`/recover?next=${encodeURIComponent(next)}`}>{t("World ID で復旧", "Recover with World ID")}</Link>
      </p>
      <SignupFlow world={worldConfig} next={next} devFakeWorld={process.env.DEV_FAKE_WORLD_ID === "1"} />
    </div>
  );
}
