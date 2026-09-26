import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import JoinFlow, { type MethodOption } from "@/components/JoinFlow";
import Steps from "@/components/Steps";
import { currentAccount, memberOf } from "@/lib/auth";
import { config } from "@/lib/config";
import { getGroup, getMethod } from "@/lib/groups";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getGroup(groupId);
  if (!group) notFound();
  const me = await currentAccount();
  if (me && (await memberOf(me.id, groupId))) redirect(`/groups/${groupId}`);
  const here = `/groups/${groupId}/join`;
  const { lang, t } = await getT();

  // Group's methods, plus "diagnosis" always listed (disabled until the EHR service exists).
  const ids = group.methods.includes("diagnosis") ? group.methods : [...group.methods, "diagnosis"];
  const methods: MethodOption[] = ids.map((id) => {
    const m = getMethod(id);
    return { id, name: m.name, available: m.available && group.methods.includes(id), note: m.note };
  });

  return (
    <div className="narrow">
      <p className="small"><Link href={`/groups/${groupId}`}>← {group.name[lang]}</Link></p>
      <h1>{t(`${group.name.ja} に参加`, `Join ${group.name.en}`)}</h1>
      {me ? (
        <JoinFlow group={{ id: group.id, name: group.name }} methods={methods} verifierUrl={config.verifierUrl} devFakeMyna={config.devFakeMyna} />
      ) : (
        <div className="stack">
          <Steps
            steps={[
              { label: t("アカウント", "Account"), state: "current" },
              { label: t("表示名・方法", "Name & method"), state: "todo" },
              { label: t("マイナで証明", "Prove"), state: "todo" },
              { label: t("参加", "Join"), state: "todo" },
            ]}
          />
          <div className="card stack">
            <p>
              {t(
                "まずアカウントが必要です。World ID で1回だけ本人確認し、以後はパスキーでログインします。",
                "First, an account: verify once with World ID, then log in with a passkey from then on.",
              )}
            </p>
            <div className="row">
              <Link className="button" href={`/signup?next=${encodeURIComponent(here)}`}>{t("アカウント作成", "Create account")}</Link>
              <Link className="button secondary" href={`/login?next=${encodeURIComponent(here)}`}>{t("ログイン", "Log in")}</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
