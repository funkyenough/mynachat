"use client";

import { useEffect, useRef, useState } from "react";

// A sample diagnosis (傷病名) exchange with Myna Portal, split into runs the prover reveals (R)
// or hides. The endpoint and request are real; the response format is illustrative, since the
// EHR sharing service that fills it is not live yet (WDE401 today).
type Run = [text: string, revealed?: true];
const RUNS: Run[] = [
  ["POST "],
  ["/api/my/healthinfo/get-six-medical-info", true],
  [" HTTP/1.1\nHost: myna.go.jp\nCookie: SESSION=9f2c1e7a4bd03e58a1c6\n\n"],
  ['{"commonHeader":{"screenId":"hm_mc_________"},"reqBody":{"cipCategory":"'],
  ["SBM", true],
  ['"}}\n\nHTTP/1.1 200 OK\n{"resultCode":"0000","resBody":{"diseaseList":[\n'],
  ['  {"name":"'],
  ["潰瘍性大腸炎", true],
  ['","icd10":"'],
  ["K51.9", true],
  ['",\n   "startDate":"2024-05-13","institution":"みなと総合病院"},\n'],
  ['  {"name":"うつ病","icd10":"F32.9",\n   "startDate":"2025-11-02","institution":"さくら心療内科"},\n'],
  ['  {"name":"本態性高血圧症","icd10":"I10",\n   "startDate":"2023-02-20","institution":"こうち内科"}]}}'],
];

const bytes = (s: string) => new TextEncoder().encode(s).length;
const TOTAL = RUNS.reduce((n, [t]) => n + bytes(t), 0);
const SHOWN = RUNS.reduce((n, [t, r]) => n + (r ? bytes(t) : 0), 0);

const TEXT = {
  ja: {
    you: "あなたの画面",
    group: "患者会の検証者",
    sample: "見本・形式は想定",
    youCap: "マイナポータルから届いた傷病名の一覧。全体はあなたのブラウザの中にだけあります。",
    groupCap: `検証者が読めるのは ${TOTAL} バイト中 ${SHOWN} バイトだけ。ほかの病名、医療機関、日付はゼロで埋められています。それでも、この応答が myna.go.jp から改ざんなく届いたことは確かめられます。`,
  },
  en: {
    you: "Your browser",
    group: "The group's verifier",
    sample: "Sample, format illustrative",
    youCap: "Your diagnosis list from Myna Portal. The full response only ever exists in your browser.",
    groupCap: `The verifier can read ${SHOWN} of ${TOTAL} bytes. Your other diagnoses, hospitals and dates are zeros, yet it can still confirm the response came from myna.go.jp unaltered.`,
  },
};

type View = "you" | "group";

/** The same transcript seen by you and by the group's verifier. Redacts itself once on load. */
export default function RedactionDemo({ lang }: { lang: "ja" | "en" }) {
  const t = TEXT[lang];
  const [view, setView] = useState<View>("you");
  const touched = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => !touched.current && setView("group"), 1600);
    return () => clearTimeout(timer);
  }, []);

  const pick = (v: View) => {
    touched.current = true;
    setView(v);
  };

  return (
    <figure className="redact" data-view={view}>
      <div className="redact-bar">
        <div className="seg" role="group">
          <button type="button" aria-pressed={view === "you"} onClick={() => pick("you")}>{t.you}</button>
          <button type="button" aria-pressed={view === "group"} onClick={() => pick("group")}>{t.group}</button>
        </div>
        <span className="sample">{t.sample}</span>
      </div>
      <pre aria-live="polite">
        {RUNS.map(([text, revealed], i) =>
          revealed ? (
            <mark key={i}>{text}</mark>
          ) : (
            // Split on whitespace so hidden runs black out word by word, like the verifier's zeroed bytes.
            text.split(/(\s+)/).map((w, j) =>
              /^\s*$/.test(w) ? w : <span key={`${i}-${j}`} className="hid">{w}</span>,
            )
          ),
        )}
      </pre>
      <figcaption>{view === "you" ? t.youCap : t.groupCap}</figcaption>
    </figure>
  );
}
