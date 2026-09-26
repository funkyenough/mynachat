import Link from "next/link";
import { notFound } from "next/navigation";
import JoinFlow, { type MethodOption } from "@/components/JoinFlow";
import { config } from "@/lib/config";
import { getGroup, getMethod } from "@/lib/groups";
import { currentMember } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getGroup(groupId);
  if (!group) notFound();

  const me = await currentMember(groupId);
  if (me) {
    return (
      <>
        <h1>{group.name.ja} / {group.name.en}</h1>
        <p>
          すでに参加しています / You are already a member as <span className="pseudo">#{me.pseudonym}</span>.{" "}
          <Link href={`/groups/${groupId}`}>掲示板へ / Go to board</Link>
        </p>
      </>
    );
  }

  // Group's methods, plus "diagnosis" always listed (disabled until the EHR service exists).
  const ids = group.methods.includes("diagnosis") ? group.methods : [...group.methods, "diagnosis"];
  const methods: MethodOption[] = ids.map((id) => {
    const m = getMethod(id);
    return { id, name: m.name, available: m.available && group.methods.includes(id), note: m.note };
  });

  return (
    <>
      <p className="small"><Link href="/">← グループ一覧 / Groups</Link></p>
      <h1>{group.name.ja} / {group.name.en}</h1>
      {group.description && <p className="muted">{group.description.ja} / {group.description.en}</p>}
      <JoinFlow
        group={{ id: group.id, name: group.name }}
        methods={methods}
        appId={config.appId}
        environment={config.environment}
        verifierUrl={config.verifierUrl}
        devFakeMyna={config.devFakeMyna}
      />
    </>
  );
}
