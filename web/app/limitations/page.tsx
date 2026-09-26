import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/lang";
import { headingFonts } from "../fonts";
import "../info.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("制限事項 · mynachat", "Limitations · mynachat") };
}

type Limit = { title: [string, string]; body: [string, string]; plan?: [string, string] };
type Section = { id: string; title: [string, string]; items: Limit[] };

const SECTIONS: Section[] = [
  {
    id: "proof",
    title: ["証明の強さ", "What a proof does and doesn't show"],
    items: [
      {
        title: ["処方は診断ではありません", "A prescription is not a diagnosis"],
        body: [
          "証明できるのは「その薬が処方された」ことであり、その理由までは分かりません。同じ薬が別の病気に使われることもあります（例: モンテルカストは花粉症にも喘息にも使われます）。そのため、各グループでは病気と関係の深い薬だけを対象にしています。これは、ハッカソンの時点で使えるデータが処方薬しかなかったための暫定的な方法です。",
          "A proof shows a drug was prescribed, not why. Some drugs treat more than one condition (montelukast is used for both hay fever and asthma), so each group lists only drugs closely tied to its condition. This is implemented as a workaround because no other useful data is available to me at the time of the hackathon.",
        ],
      },
      {
        title: ["指定難病による証明は未検証です", "Intractable disease proofs are untested"],
        body: [
          "mynachat は、マイナポータルで指定難病（厚生労働省が定めた難病）の医療情報を取得できることから着想しました。ただ、開発メンバーには指定難病の患者がいないため、この証明はまだ実際に試せていません。",
          "mynachat started from the fact that Myna Portal provides medical information for people with designated intractable diseases (指定難病), which are conditions officially designated by the Ministry of Health, Labour and Welfare (MHLW). I do not have a designated intractable disease, so I haven't been able to test this proof yet. I will be testing with volunteers who have a designated intractable disease going forward.",
        ],
      },
      {
        title: ["正式な診断名はまだ証明できません", "Official diagnoses can't be proven yet"],
        body: [
          "電子カルテ情報共有サービスは、医療機関の電子カルテにある傷病名などの情報を共有するための国の仕組みです。現在はモデル事業の段階で、2027年に本格運用が始まる予定です。マイナポータルにはすでにこのデータを取得する通信（`/api/my/healthinfo/get-six-medical-info`）があり、傷病名は ICD-10 に対応した MEDIS 標準病名マスターのコードで記録されます。ただし、まだデータが提供されていないため、現在はエラー（`WDE401`）が返ります。本格運用が始まれば、これが病気を証明する主な方法になると考えています。",
          "Japan's EHR sharing service (電子カルテ情報共有サービス) is a government initiative to share diagnoses and other data from hospitals' electronic medical records. It is in a pilot phase and is expected to be fully running in 2027. Myna Portal already has an endpoint for this data (`/api/my/healthinfo/get-six-medical-info`), with diagnoses recorded as MEDIS standard disease codes (標準病名マスター), which map to ICD-10. Today the endpoint returns an error (`WDE401`) because no data flows into it yet. Once the service rolls out, we expect it to become the main way to prove a condition.",
        ],
      },
    ],
  },
  {
    id: "portal",
    title: ["マイナポータルとの関係", "Depending on Myna Portal"],
    items: [
      {
        title: ["判定は検証者が行います", "The TLSNotary verifier makes the call"],
        body: [
          "マイナポータルの医療情報には電子署名が付いていないため、TLSNotary を使って、そのデータが確かにマイナポータルから届いたものであることを確認しています。TLSNotary では、あなたが証明者（prover）、mynachat が検証者（verifier）です。検証者はあなたが開示していない内容を読むことはできませんが、技術的には証明を無視して合否を決めることもできます。将来的には、各患者会の中で信頼される人や団体が検証者を運営する想定です。長期的には、国が提供するデータに電子署名が付けば、この信頼は不要になります。",
          "Medical records from Myna Portal carry no digital signature, so we rely on TLSNotary to show that a record really came from Myna Portal. In TLSNotary terms, you are the prover and mynachat is the verifier. The verifier can't read anything you don't disclose, but nothing technically stops it from ignoring the proof and deciding however it likes. The design assumes that a trusted party within each patient group will eventually run the verifier. In the long run, we can avoid this trust assumption if the government signed the data it provides, which would be awesome.",
        ],
      },
      {
        title: ["利用規約と個人情報の扱いは未確認です", "Terms of use and health data rules are unresolved"],
        body: [
          "ユーザーのセッション Cookie を使ってマイナポータルの画面と同じ通信を行っているため、専用の Chrome 拡張機能のインストールが必要です。これは暫定的な回避策です。マイナポータルの公式 API の利用を申請すれば解消できますが、承認までに6〜12か月かかります。ハッカソンのデモとしては、この方法が妥当だと考えています。",
          "We reuse the user's session cookie to send requests to Myna Portal's web page, which requires the user to install a custom Chrome extension. This is a workaround. Requesting official Myna Portal API access would resolve this issue, but approval takes 6 to 12 months, so we think it's justified for a hackathon demo.",
        ],
      },
    ],
  },
];

/** Renders `backticked` spans as inline code, like Markdown. */
function inlineCode(text: string) {
  return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

export default async function Limitations() {
  const { t } = await getT();
  return (
    <article className={`info ${headingFonts}`}>
      <h1>{t("制限事項", "Limitations")}</h1>
      <p className="info-lede">
        {t(
          "mynachat はハッカソンで作ったプロトタイプです。できること以上に見せないよう、できないことと未解決の課題をここにまとめています。",
          "mynachat is a hackathon prototype. So it never looks like more than it is, here is what it can't do yet and what's still open.",
        )}
      </p>
      <ul className="info-toc">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>{t(...s.title)}</a>
          </li>
        ))}
      </ul>

      {SECTIONS.map((s) => (
        <section key={s.id}>
          <h2 id={s.id}>{t(...s.title)}</h2>
          <ul className="limits">
            {s.items.map((it) => (
              <li key={it.title[1]}>
                <h3>{t(...it.title)}</h3>
                <p>{inlineCode(t(...it.body))}</p>
                {it.plan && <span className="limit-plan">→ {t(...it.plan)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="info-next">
        <p>
          {t("証明の流れは「仕組み」で説明しています。", "The proof itself is explained on the How it works page.")}
        </p>
        <Link className="button" href="/how-it-works">
          {t("仕組みを読む", "How it works")}
        </Link>
      </div>
    </article>
  );
}
