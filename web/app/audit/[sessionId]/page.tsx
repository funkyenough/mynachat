import AuditReport from "@/components/AuditReport";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <AuditReport sessionId={sessionId} />;
}
