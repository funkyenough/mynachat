// ICD-10 (2013, as used in Japan) lookup and search. Data: assets/icd10.json,
// built by scripts/build-icd10.py from e-Stat (Japanese) and CMS ICD-10-CM (English titles).
import fs from "node:fs";
import path from "node:path";

export type IcdKind = 0 | 1 | 2 | 3; // chapter, block, category, subcategory
export type IcdEntry = { code: string; kind: IcdKind; ja: string; en: string | null; parent: string | null };

type Index = { list: IcdEntry[]; byCode: Map<string, IcdEntry>; children: Map<string, IcdEntry[]>; keys: string[] };

let index: Index | null = null;

/**
 * Everyday names and readings that ICD-10's formal titles don't contain (it has no kana
 * readings, and e.g. 花粉症 is 「花粉によるアレルギー性鼻炎」). Matched like names.
 */
const ALIASES: Record<string, string[]> = {
  "J30.1": ["花粉症", "かふんしょう", "hay fever", "pollen allergy"],
  "G12": ["sma", "せきずいせいきんいしゅくしょう"],
  "G12.2": ["als", "筋萎縮性側索硬化症", "lou gehrig"],
  "J45": ["ぜんそく", "喘息", "asthma"],
  "L20": ["アトピー", "atopic dermatitis", "eczema"],
  "E11": ["糖尿病", "とうにょうびょう", "diabetes", "type 2 diabetes"],
  "E10": ["1型糖尿病", "type 1 diabetes"],
  "I10": ["高血圧", "こうけつあつ", "hypertension"],
  "F32": ["うつ", "うつ病", "depression"],
  "F31": ["双極性障害", "躁うつ病", "bipolar"],
  "F20": ["とうごうしっちょうしょう"],
  "F90": ["adhd", "注意欠陥多動性障害", "注意欠如多動症"],
  "F84.0": ["自閉症", "自閉スペクトラム症", "asd", "autism"],
  "F43.1": ["ptsd"],
  "F03": ["認知症", "dementia"],
  "G30": ["アルツハイマー", "alzheimer"],
  "G20": ["パーキンソン", "parkinson"],
  "G35": ["ms", "たはつせいこうかしょう"],
  "G43": ["片頭痛", "偏頭痛", "へんずつう", "migraine"],
  "K50": ["くろーんびょう", "crohn"],
  "K51": ["uc", "かいようせいだいちょうえん"],
  "K58": ["ibs", "過敏性腸症候群"],
  "M05": ["リウマチ", "関節リウマチ", "rheumatoid arthritis"],
  "M32": ["sle", "全身性エリテマトーデス", "lupus"],
  "U07.1": ["コロナ", "新型コロナ", "covid", "covid-19"],
  "U09.9": ["後遺症", "long covid"],
  "C50": ["乳がん", "乳癌", "breast cancer"],
  "C34": ["肺がん", "肺癌", "lung cancer"],
  "C16": ["胃がん", "胃癌", "stomach cancer"],
  "C18": ["大腸がん", "大腸癌", "colon cancer"],
  "C61": ["前立腺がん", "前立腺癌", "prostate cancer"],
  "C91.0": ["白血病", "leukemia", "all"],
  "N18": ["腎臓病", "ckd", "chronic kidney disease"],
  "E05": ["バセドウ病", "graves"],
  "E06.3": ["橋本病", "hashimoto"],
  "L40": ["乾癬", "かんせん", "psoriasis"],
  "D57": ["鎌状赤血球症"],
  "E84": ["嚢胞性線維症", "cf"],
};

/** NFKC, lower case, katakana -> hiragana, drop spaces and punctuation, so 「カフン」 finds 「花粉」 readings typed either way. */
export function norm(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s，,、。・＜＞<>［］\[\]（）()'"-]/g, "");
}

function load(): Index {
  if (index) return index;
  const raw: [string, IcdKind, string, string | null, string | null][] = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "assets", "icd10.json"), "utf8"),
  );
  const list = raw.map(([code, kind, ja, en, parent]) => ({ code, kind, ja, en, parent }));
  const byCode = new Map(list.map((e) => [e.code, e]));
  const children = new Map<string, IcdEntry[]>();
  for (const e of list) if (e.parent) children.set(e.parent, [...(children.get(e.parent) ?? []), e]);
  const keys = list.map((e) => `${norm(e.code)}|${norm(e.ja)}|${norm(e.en ?? "")}|${(ALIASES[e.code] ?? []).map(norm).join("|")}`);
  return (index = { list, byCode, children, keys });
}

export const getCode = (code: string) => load().byCode.get(code);
export const childrenOf = (code: string) => load().children.get(code) ?? [];

/** Chapter > block > category trail for a code, root first. */
export function trail(code: string): IcdEntry[] {
  const out: IcdEntry[] = [];
  for (let e = getCode(code); e; e = e.parent ? getCode(e.parent) : undefined) out.unshift(e);
  return out;
}

/** Searches categories and subcategories by code ("J30", "j301") or name (ja/en). */
export function search(q: string, limit = 30): IcdEntry[] {
  const { list, keys } = load();
  const nq = norm(q);
  if (!nq) return [];
  const codeQ = nq.replace(".", "");
  const scored: { e: IcdEntry; s: number }[] = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.kind < 2) continue;
    const [kc, kja, ken, ...aliases] = keys[i].split("|");
    const code = kc.replace(".", "");
    let s = -1;
    if (code === codeQ) s = 100;
    else if (code.startsWith(codeQ) && /^[a-z]\d/.test(codeQ)) s = 80 - code.length;
    else if (aliases.some((a) => a === nq)) s = 90;
    else if (aliases.some((a) => a.startsWith(nq))) s = 70;
    else if (kja.startsWith(nq) || ken.startsWith(nq)) s = 60;
    else if (kja.includes(nq) || ken.includes(nq) || (nq.length > 1 && aliases.some((a) => a.includes(nq)))) s = 40;
    if (s < 0) continue;
    // Prefer shorter names and whole categories over subcategories.
    scored.push({ e, s: s - (e.kind === 3 ? 3 : 0) - Math.min(e.ja.length, 40) / 20 });
  }
  scored.sort((a, b) => b.s - a.s || a.e.code.localeCompare(b.e.code));
  return scored.slice(0, limit).map((x) => x.e);
}
