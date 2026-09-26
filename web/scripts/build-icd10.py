#!/usr/bin/env python3
"""Builds data/icd10.json for the disease search.

Sources (download both, then run: python3 scripts/build-icd10.py <ja.csv> <cms_order.txt>):
  - Japanese: 疾病、傷害及び死因の統計分類（基本分類）ICD-10(2013年版), e-Stat
    https://www.e-stat.go.jp/term/download?bKbn=40&kaiteiCode=03&charset=UTF-8&bom=0&searchMethod=keyword&searchWord=&komokuSearchFlg=1
  - English: CMS ICD-10-CM order file (public domain), used only for titles of codes
    that also exist in WHO ICD-10. https://www.cms.gov/files/zip/2026-code-descriptions-tabular-order.zip

Output rows: [code, kind, ja, en, parent] with kind 0 chapter, 1 block, 2 category, 3 subcategory.
"""
import csv, json, re, sys

CHAPTERS_EN = {
    "I": "Certain infectious and parasitic diseases", "II": "Neoplasms",
    "III": "Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism",
    "IV": "Endocrine, nutritional and metabolic diseases", "V": "Mental and behavioural disorders",
    "VI": "Diseases of the nervous system", "VII": "Diseases of the eye and adnexa",
    "VIII": "Diseases of the ear and mastoid process", "IX": "Diseases of the circulatory system",
    "X": "Diseases of the respiratory system", "XI": "Diseases of the digestive system",
    "XII": "Diseases of the skin and subcutaneous tissue",
    "XIII": "Diseases of the musculoskeletal system and connective tissue",
    "XIV": "Diseases of the genitourinary system", "XV": "Pregnancy, childbirth and the puerperium",
    "XVI": "Certain conditions originating in the perinatal period",
    "XVII": "Congenital malformations, deformations and chromosomal abnormalities",
    "XVIII": "Symptoms, signs and abnormal clinical and laboratory findings, not elsewhere classified",
    "XIX": "Injury, poisoning and certain other consequences of external causes",
    "XX": "External causes of morbidity and mortality",
    "XXI": "Factors influencing health status and contact with health services",
    "XXII": "Codes for special purposes",
}

ja_path, cms_path = sys.argv[1], sys.argv[2]

en = {}
for line in open(cms_path, encoding="latin-1"):
    code, long = line[6:13].strip(), line[77:].strip()
    en[code] = long

rows, seen = [], set()
parents = {0: None, 1: None, 2: None}
with open(ja_path, encoding="utf-8") as f:
    r = csv.reader(f)
    next(r); next(r)  # title, header
    for code, name in r:
        code = code.replace("†", "").replace("*", "").strip()
        if re.fullmatch(r"[IVX]+", code):
            kind, e = 0, CHAPTERS_EN.get(code)
        elif "-" in code:
            kind, e = 1, None
        elif re.fullmatch(r"[A-Z]\d\d", code):
            kind, e = 2, en.get(code)
        else:
            kind = 3
            e = en.get(re.sub(r"[ab]$", "", code).replace(".", ""))
        if code in seen:
            continue
        seen.add(code)
        parent = parents[kind - 1] if kind > 0 else None
        if kind < 3:
            parents[kind] = code
        rows.append([code, kind, name.strip(), e, parent])

json.dump(rows, sys.stdout, ensure_ascii=False, separators=(",", ":"))
counts = [sum(1 for x in rows if x[1] == k) for k in range(4)]
with_en = sum(1 for x in rows if x[3])
print(f"chapters {counts[0]}, blocks {counts[1]}, categories {counts[2]}, subcategories {counts[3]}; "
      f"English titles for {with_en}/{len(rows)}", file=sys.stderr)
