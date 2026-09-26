import { groupsForCode } from "@/lib/groups";
import { json } from "@/lib/http";
import { search } from "@/lib/icd10";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  const results = search(q, 25).map((e) => ({ ...e, groups: groupsForCode(e.code).length }));
  return json({ results });
}
