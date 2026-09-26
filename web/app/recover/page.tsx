import Link from "next/link";
import { redirect } from "next/navigation";
import RecoverFlow from "@/components/RecoverFlow";
import { currentAccount } from "@/lib/auth";
import { worldConfig } from "@/lib/config";
import { safeNext } from "@/lib/http";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next);
  const { t } = await getT();
  return (
    <div className="narrow">
      <h1>{t("アカウントの復旧", "Recover your account")}</h1>
      <p className="muted small">
        {t(
          "パスキーをなくした、または新しい端末を使うときに。World ID でアカウントを確認し、新しいパスキーを登録します。",
          "Lost your passkey or on a new device? Confirm the account with World ID and register a new passkey.",
        )}{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("ログイン", "Log in")}</Link>
      </p>
      <RecoverFlow world={worldConfig} next={next} devFakeWorld={process.env.DEV_FAKE_WORLD_ID === "1"} />
    </div>
  );
}
