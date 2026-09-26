import Link from "next/link";
import { redirect } from "next/navigation";
import SignupFlow from "@/components/SignupFlow";
import { currentAccount } from "@/lib/auth";
import { worldConfig } from "@/lib/config";
import { safeNext } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next);
  return (
    <div className="narrow">
      <h1>アカウント作成 / Create your account</h1>
      <p className="muted small">
        すでにアカウントがありますか？ <Link href={`/login?next=${encodeURIComponent(next)}`}>ログイン / Log in</Link>
        <br />
        パスキーをなくした場合も、ここで World ID を使えば同じアカウントを取り戻せます。 / Lost your passkey? Verifying with World
        ID here recovers the same account.
      </p>
      <SignupFlow world={worldConfig} next={next} devFakeWorld={process.env.DEV_FAKE_WORLD_ID === "1"} />
    </div>
  );
}
