"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./LangProvider";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

type Result = { code: string; kind: number; ja: string; en: string | null; groups: number };

const TEXT = {
  ja: { placeholder: "病名やICD-10コードで検索", eg: "例", none: "該当する病名はありません", badge: "コミュニティあり", examples: ["花粉症", "片頭痛", "潰瘍性大腸炎"] },
  en: { placeholder: "Search a condition or ICD-10 code", eg: "e.g.", none: "No matches in ICD-10", badge: "Community", examples: ["hay fever", "migraine", "ulcerative colitis"] },
};

/** Search box over all of ICD-10 (codes, Japanese and English names), in the page language. */
export default function DiseaseSearch({ autoFocus, lang: langProp }: { autoFocus?: boolean; lang?: Lang }) {
  const ctx = useT();
  const lang = langProp ?? ctx.lang;
  const t = TEXT[lang];
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: Result[] }>(`/api/icd10?q=${encodeURIComponent(query)}`);
        if (n === seq.current) {
          setResults(r.results);
          setActive(0);
          setError(null);
        }
      } catch (e) {
        if (n === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const go = (code: string) => router.push(`/disease/${encodeURIComponent(code)}`);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Enter" && results[active]) go(results[active].code);
    else return;
    e.preventDefault();
  }

  return (
    <div className="search">
      <input
        type="search"
        className="search-input"
        placeholder={t.placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="icd-results"
        aria-autocomplete="list"
      />
      {!q && (
        <div className="row small chips">
          <span className="muted">{t.eg}</span>
          {t.examples.map((x) => (
            <button key={x} type="button" className="chip" onClick={() => setQ(x)}>{x}</button>
          ))}
        </div>
      )}
      {error && <p className="error small">{error}</p>}
      {q.trim() && !loading && results.length === 0 && !error && (
        <p className="muted small">{t.none}</p>
      )}
      {results.length > 0 && (
        <ul className="results" id="icd-results" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.code}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.code)}
            >
              <span className="code">{r.code}</span>
              <span className="names">
                {lang === "en" && r.en ? (
                  <>
                    <span>{r.en}</span>
                    <span className="muted small">{r.ja}</span>
                  </>
                ) : (
                  <>
                    <span>{r.ja}</span>
                  </>
                )}
              </span>
              {r.groups > 0 && <span className="badge">{t.badge}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
