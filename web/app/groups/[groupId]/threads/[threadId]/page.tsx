import Link from "next/link";
import { notFound } from "next/navigation";
import ThreadView from "@/components/ThreadView";
import { currentMember } from "@/lib/auth";
import { threadDetail } from "@/lib/board";
import { worldConfig } from "@/lib/config";
import { getGroup } from "@/lib/groups";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ groupId: string; threadId: string }> }) {
  const { groupId, threadId } = await params;
  const group = getGroup(groupId);
  const me = group ? await currentMember(groupId) : undefined;
  const detail = me ? await threadDetail(Number(threadId), me.id) : undefined;
  if (!group || !detail || detail.group_id !== groupId) notFound();

  return (
    <>
      <p className="small"><Link href={`/groups/${groupId}`}>← {group.name.ja} / {group.name.en}</Link></p>
      <ThreadView groupId={groupId} memberId={me!.id} initial={detail} world={worldConfig} devFakeWorld={process.env.DEV_FAKE_WORLD_ID === "1"} />
    </>
  );
}
