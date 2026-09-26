import { groupAcceptsMethod } from "@/lib/groups";
import { fail, json, readJson } from "@/lib/http";
import { createSession } from "@/lib/sessions";

export async function POST(req: Request) {
  const body = await readJson(req);
  const groupId = body?.groupId, method = body?.method;
  if (typeof groupId !== "string" || typeof method !== "string") return fail(400, "groupId and method required");
  if (!groupAcceptsMethod(groupId, method)) return fail(400, "group does not accept this method");
  return json({ sessionId: await createSession(groupId, method) });
}
