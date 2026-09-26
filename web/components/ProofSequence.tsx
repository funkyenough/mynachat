"use client";

import { useEffect, useId, useState } from "react";
import { useT } from "./LangProvider";
import "./ProofSequence.css";

/** The MPC-TLS proof as a Mermaid sequence diagram, in the page language. */
const source = (t: (ja: string, en: string) => string) => `sequenceDiagram
  autonumber
  participant You as ${t("あなたの端末", "Your device")}
  participant Verifier as ${t("患者会の検証者", "Group's verifier")}
  participant Myna as myna.go.jp
  participant App as mynachat
  You->>Verifier: ${t("TLS の鍵を分け合う (MPC)", "Split the TLS keys (MPC)")}
  Note over You,Verifier: ${t("どちらか一方だけでは通信を読めない", "Neither can read the traffic alone")}
  You->>Myna: ${t("傷病名・処方データの問い合わせ（暗号化）", "Diagnostics/prescription request (encrypted)")}
  Myna-->>You: ${t("返事（暗号化）", "Reply (encrypted)")}
  You->>Verifier: ${t("診断名/薬の名前だけを開示", "Reveal diagnosis/prescription")}
  Note over Verifier: ${t("myna.go.jp の証明書、パス、<br/>リストにあるかを確認", "Checks the myna.go.jp certificate,<br/>the path, and the group's list")}
  Verifier->>App: ${t("判定", "Verdict")}
  App-->>You: ${t("グループに参加", "You join the group")}
`;

export default function ProofSequence() {
  const { t } = useT();
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const text = source(t);

  useEffect(() => {
    let cancelled = false;
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const draw = async () => {
      const { default: mermaid } = await import("mermaid");
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        fontFamily: 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif',
        themeVariables: {
          darkMode: scheme.matches,
          background: v("--card"),
          primaryColor: v("--card"),
          primaryBorderColor: v("--accent"),
          primaryTextColor: v("--fg"),
          actorBkg: v("--card"),
          actorBorder: v("--accent"),
          actorTextColor: v("--fg"),
          actorLineColor: v("--line"),
          signalColor: v("--fg"),
          signalTextColor: v("--fg"),
          noteBkgColor: v("--bg"),
          noteBorderColor: v("--line"),
          noteTextColor: v("--muted"),
          sequenceNumberColor: v("--accent-fg"),
          lineColor: v("--fg"),
        },
        sequence: { mirrorActors: false, useMaxWidth: true, messageAlign: "center" },
      });
      const out = await mermaid.render(`seq${id}`, text);
      if (!cancelled) setSvg(out.svg);
    };
    draw();
    scheme.addEventListener("change", draw);
    return () => {
      cancelled = true;
      scheme.removeEventListener("change", draw);
    };
  }, [id, text]);

  return (
    <figure className="seq" aria-label={t("証明の流れ", "How the proof flows")}>
      <div className="seq-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  );
}
