import Link from "next/link";
import DiseaseSearch from "@/components/DiseaseSearch";
import { listOpenGroups } from "@/lib/groups";
import { getCode } from "@/lib/icd10";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const { lang, t } = await getT();
  const groups = listOpenGroups();
  return (
    <>
      <section className="hero">
        <h1>{t("病名を探す", "Find your condition")}</h1>
        <p className="lede">{t("ICD-10 の全項目から、病名やコードで検索できます。", "Search all of ICD-10 by name or code.")}</p>
        <DiseaseSearch autoFocus />
      </section>

      <h2>{t("参加できるコミュニティ", "Communities open now")}</h2>
      <div className="grid-cards">
        {groups.map((g) => (
          <Link className="card link-card" key={g.id} href={`/groups/${g.id}`}>
            <strong>{g.name[lang]}</strong>
            {g.description && <span className="small muted">{g.description[lang]}</span>}
            <span className="row small">
              {g.icd10.length > 0
                ? g.icd10.map((c) => {
                    const e = getCode(c);
                    return <span className="code" key={c} title={lang === "en" ? e?.en ?? e?.ja : e?.ja}>{c}</span>;
                  })
                : <span className="muted">{t("複数疾患", "Cross-condition")}</span>}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
