import { currentAccount, HANDLE_RE, handleTaken, memberOf } from "@/lib/auth";
import { groupAcceptsMethod } from "@/lib/groups";
import { fail, json, readJson } from "@/lib/http";
import { createSession } from "@/lib/sessions";

export async function POST(req: Request) {
  const me = await currentAccount();
  if (!me) return fail(401, "log in first");
  const body = await readJson(req);
  const groupId = body?.groupId, method = body?.method, handle = String(body?.handle ?? "").trim();
  if (typeof groupId !== "string" || typeof method !== "string") return fail(400, "groupId and method required");
  if (!groupAcceptsMethod(groupId, method)) return fail(400, "group does not accept this method");
  if (await memberOf(me.id, groupId)) return fail(409, "already a member of this group");
  if (!HANDLE_RE.test(handle)) return fail(400, "display name: 2–20 letters, digits, _ . -");
  if (await handleTaken(groupId, handle)) return fail(409, "that display name is taken in this group");
  return json({ sessionId: await createSession(me.id, groupId, method, handle) });
}
