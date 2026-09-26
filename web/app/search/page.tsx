import Link from "next/link";
import DiseaseSearch from "@/components/DiseaseSearch";
import { listGroups } from "@/lib/groups";
import { getCode } from "@/lib/icd10";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  const groups = listGroups();
  return (
    <>
      <section className="hero">
        <h1>病名を探す</h1>
        <p className="lede">Find your condition. Search all of ICD-10 by name or code.</p>
        <DiseaseSearch autoFocus />
      </section>

      <h2>参加できるコミュニティ / Communities open now</h2>
      <div className="grid-cards">
        {groups.map((g) => (
          <Link className="card link-card" key={g.id} href={`/groups/${g.id}`}>
            <strong>{g.name.ja}</strong>
            <span className="muted small">{g.name.en}</span>
            {g.description && <span className="small">{g.description.ja}</span>}
            <span className="row small">
              {g.icd10.length > 0
                ? g.icd10.map((c) => <span className="code" key={c} title={getCode(c)?.ja}>{c}</span>)
                : <span className="muted">複数疾患 / Cross-condition</span>}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
