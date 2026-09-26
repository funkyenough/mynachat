// Register interest in a community for an ICD-10 code that has no verified group yet. Toggle.
import { currentAccount } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { getCode } from "@/lib/icd10";

export async function POST(req: Request) {
  const me = await currentAccount();
  if (!me) return fail(401, "log in first");
  const code = String((await readJson(req))?.code ?? "");
  if (!getCode(code)) return fail(404, "unknown ICD-10 code");
  const db = await getDb();
  const had = db.get("SELECT 1 AS x FROM waitlist WHERE icd_code = ? AND account_id = ?", [code, me.id]);
  if (had) db.run("DELETE FROM waitlist WHERE icd_code = ? AND account_id = ?", [code, me.id]);
  else db.run("INSERT INTO waitlist (icd_code, account_id, created_at) VALUES (?, ?, ?)", [code, me.id, Date.now()]);
  return json({ on: !had });
}
