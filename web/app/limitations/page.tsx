import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/lang";
import { display } from "../fonts";
import "../info.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("制限事項 · mynachat", "Limitations · mynachat") };
}

type Limit = { title: [string, string]; body: [string, string]; plan?: [string, string]; major?: boolean };
type Section = { id: string; title: [string, string]; items: Limit[] };

const SECTIONS: Section[] = [
  {
    id: "proof",
    title: ["証明の強さ", "What a proof does and doesn't show"],
    items: [
      {
        major: true,
        title: ["処方は診断ではありません", "A prescription is not a diagnosis"],
        body: [
          "証明できるのは「その薬が処方された」ことです。同じ薬が別の病気に使われることもあります（例: モンテルカストは花粉症にも喘息にも使われます）。そのため、病気と関係の深い薬だけをリストに入れています。",
          "A proof shows a drug was prescribed, not why. Some drugs treat more than one condition (montelukast is used for both hay fever and asthma), so each group lists only drugs closely tied to its condition.",
        ],
        plan: ["傷病名での証明: 電子カルテ情報共有サービス（2027年予定）", "Diagnosis proofs: EHR sharing service, planned 2027"],
      },
      {
        major: true,
        title: ["「あなた自身の」データだとは限りません", "The data may not be your own"],
        body: [
          "証明が示すのは「ログインしているマイナポータルのアカウントに、その処方がある」ことです。家族など別の人のマイナポータルに、その人の協力でログインすれば、その人のデータで参加できてしまいます。World ID の本人とマイナポータルの本人は結びついていません。",
          "A proof shows that the Myna Portal account you're logged in to has the prescription. With someone's cooperation, a family member's login would work too. The World ID behind your account and the person behind the Myna Portal session aren't linked.",
        ],
        plan: ["マイナンバーカードの署名用電子証明書で同一人物だと示す仕組みを検討中", "Exploring a My Number Card (JPKI) signature to bind the two"],
      },
      {
        title: ["使える証明方法は処方薬だけ", "Only prescriptions work today"],
        body: [
          "指定難病の認定や医療受給者証での証明は「準備中」です。そのため、参加できるのは処方薬で確認できるグループだけです。",
          "Proofs from 指定難病 certification or medical subsidy certificates are coming soon, so only groups verified by prescription are open.",
        ],
      },
    ],
  },
  {
    id: "trust",
    title: ["信頼しているもの", "What you still have to trust"],
    items: [
      {
        title: ["判定は検証者が行います", "The verifier makes the call"],
        body: [
          "検証者は、あなたが見せていないデータを読むことはできません。ただし、合否の判定そのものは検証者を信頼しています。検証者は参加を決める患者会が運営する前提です（このデモでは mynachat が運営）。",
          "The verifier can't read what you don't reveal, but you do trust it to judge honestly. The design assumes the patient group runs it; in this demo, mynachat does.",
        ],
      },
      {
        title: ["運営者に見えるもの", "What the operators can see"],
        body: [
          "運営者は、どのアカウントがどのグループに参加しているか（あなたに一覧を見せるため）と、判定の短い記録（例: 「ビラノアの処方」）を見られます。ほかのメンバーからは、グループ同士を結びつけることはできません。",
          "The operators can see which account is in which groups (to show you your list) and a short verdict record (e.g. \"prescribed ビラノア\"). Other members can't link your groups together.",
        ],
      },
      {
        title: ["拡張機能とWorld ID", "The extension and World ID"],
        body: [
          "証明は拡張機能の中で行われるので、配布された拡張機能を信頼する必要があります（ソースは公開しています）。1人1アカウントの仕組みは World ID に依存しています。",
          "Proofs run inside the extension, so you trust the build you install (the source is public). One account per person depends on World ID.",
        ],
      },
    ],
  },
  {
    id: "accounts",
    title: ["アカウントと匿名性", "Accounts and anonymity"],
    items: [
      {
        major: true,
        title: ["パスキーをすべてなくすと戻れません", "Lose every passkey and the account is gone"],
        body: [
          "アカウントの復旧機能はありません。2台目の端末にもパスキーを追加するか、iCloud キーチェーンや Google パスワードマネージャーで同期されるパスキーを使ってください。",
          "There is no account recovery. Add a passkey on a second device, or use one that syncs (iCloud Keychain, Google Password Manager).",
        ],
      },
      {
        title: ["書いた内容からは特定されえます", "What you write can identify you"],
        body: [
          "表示名は匿名でも、小さなグループで具体的な出来事を書けば、知り合いに気づかれることはあります。",
          "Display names are anonymous, but in a small group, specific details in a post can still give you away to people who know you.",
        ],
      },
    ],
  },
  {
    id: "portal",
    title: ["マイナポータルとの関係", "Depending on Myna Portal"],
    items: [
      {
        major: true,
        title: ["利用規約と個人情報の扱いは未確認です", "Terms of use and health data rules are unresolved"],
        body: [
          "マイナポータルの画面が使う通信をそのまま利用しています。これが利用規約上どう扱われるか、また要配慮個人情報の扱いについて、正式な公開の前に明確にする必要があります。",
          "We reuse the requests Myna Portal's own web page makes. How that sits with its terms of use, and how sensitive health data (要配慮個人情報) must be handled, need a clear position before any real launch.",
        ],
      },
      {
        title: ["画面の変更で動かなくなることがあります", "Portal changes can break it"],
        body: [
          "公開 API ではなく画面用の通信を使っているため、マイナポータル側の変更で証明が失敗する可能性があります。",
          "Because these are the web page's requests rather than a public API, a change on Myna Portal's side can break proofs.",
        ],
      },
      {
        title: ["パソコンの Chrome のみ", "Desktop Chrome only"],
        body: [
          "証明には Chrome の拡張機能が必要です。スマートフォンからは参加できません（掲示板の閲覧・投稿はできます）。",
          "Proving needs the Chrome extension, so joining from a phone isn't possible yet (reading and posting on boards is).",
        ],
        plan: ["スマートフォンアプリ化を検討中", "A mobile app is on the roadmap"],
      },
    ],
  },
  {
    id: "demo",
    title: ["デモとしての制約", "Demo-stage constraints"],
    items: [
      {
        title: ["グループはまだ少数", "Only a few groups so far"],
        body: [
          "ICD-10 のすべての病名を検索できますが、参加できるグループは花粉症、片頭痛、SMA などに限られます。ほかの病名は参加希望を登録できます。",
          "Every ICD-10 condition is searchable, but only a few groups are open (hay fever, migraine, SMA). For the rest, you can register interest.",
        ],
      },
      {
        title: ["モデレーション機能はまだありません", "No moderation tools yet"],
        body: [
          "投稿の通報、削除依頼、メンバーの退会処分などの機能はまだありません。",
          "There is no reporting, moderator removal or banning yet.",
        ],
      },
      {
        title: ["1台のサーバーで動いています", "It runs on a single machine"],
        body: [
          "更新のたびに数秒止まります。データベースも1台分です。",
          "Each update causes a few seconds of downtime, and there is a single database.",
        ],
      },
    ],
  },
];

export default async function Limitations() {
  const { t } = await getT();
  return (
    <article className={`info ${display.variable}`}>
      <h1>{t("制限事項", "Limitations")}</h1>
      <p className="info-lede">
        {t(
          "mynachat はハッカソンで作ったプロトタイプです。できること以上に見せないよう、できないことと未解決の課題をここにまとめています。赤い線は特に重要なものです。",
          "mynachat is a hackathon prototype. So it never looks like more than it is, here is what it can't do yet and what's still open. Items with a red line matter most.",
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
              <li key={it.title[1]} className={it.major ? "major" : undefined}>
                <h3>{t(...it.title)}</h3>
                <p>{t(...it.body)}</p>
                {it.plan && <span className="limit-plan">→ {t(...it.plan)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="info-next">
        <p>{t("証明の流れは「仕組み」で説明しています。", "The proof itself is explained on the How it works page.")}</p>
        <Link className="button" href="/how-it-works">{t("仕組みを読む", "How it works")}</Link>
      </div>
    </article>
  );
}
