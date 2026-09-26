import Link from "next/link";
import DiseaseSearch from "@/components/DiseaseSearch";
import RedactionDemo from "@/components/RedactionDemo";
import { currentAccount } from "@/lib/auth";
import { listOpenGroups } from "@/lib/groups";
import { getLang, type Lang } from "@/lib/lang";
import { display } from "./fonts";
import "./landing.css";

export const dynamic = "force-dynamic";



const COPY = {
  ja: {
    title: ["同じ病気の人と、", "匿名で話そう。"],
    lede: "同じ病気の人だけが集まる、匿名の患者コミュニティ。参加資格は、マイナポータルにあるあなた自身のデータで確かめます。見せるのは、条件を満たしていることだけです。",
    ledgerTitle: "グループに伝わること、伝わらないこと",
    learnsTitle: "伝わること",
    learns: ["参加条件を満たしていること", "判定に使った1項目（例: 該当した病名）", "このグループでのあなたの表示名"],
    neverTitle: "伝わらないこと",
    never: ["氏名、住所、生年月日", "マイナンバー（読み取りもしません）", "ほかの病名、薬、医療機関、受診日", "あなたが参加しているほかのグループ"],
    stepsTitle: "参加までの流れ",
    howLink: "証明の仕組みを詳しく見る →",
    steps: [
      ["病名を探す", "ICD-10 の全項目から、病名やコードで検索します。"],
      ["アカウントを作る", "World ID で一度だけ本人確認し、パスキーを登録します。"],
      ["マイナポータルで証明", "条件を満たす部分だけを、患者会の検証者に見せます。"],
      ["掲示板に参加", "同じ病気の人だけが読める場所で話せます。"],
    ],
    principlesTitle: "わたしたちの約束",
    principles: [
      ["自己申告ではなく、証明", "データが myna.go.jp から改ざんなく届いたことを、TLSNotary で確かめます。書類の提出はいりません。"],
      ["1人1アカウント", "World ID で、同じ人が2つ目のアカウントを作れないようにします。なりすましや、複数アカウントを使った宣伝を防ぎます。"],
      ["グループごとに別の名前", "表示名はグループごとに選ぶので、ほかのメンバーがあなたの参加先を結びつけることはできません。"],
      ["パスワードなし", "ログインはパスキー（Touch ID、Face ID、スマートフォン）で。覚えるものも漏れるものもありません。"],
      ["秘密投票", "アンケートは1人1票。誰がどれに投票したかは、運営のサーバーにも残りません。"],
      ["検証者は患者会が運営", "証明を確かめるのは、参加を決める患者会自身です。第三者の認証機関は入りません。"],
    ],
    groupsTitle: "いま参加できるグループ",
    groupsNote: ["ほかの病名は", "検索", "から。グループがなければ参加希望を登録できます。"],
    faqTitle: "よくある質問",
    faq: [
      ["マイナンバーは使われますか？", "マイナンバーそのものは読み取りません。マイナポータルにログインしたあなたのブラウザの中で、必要な項目だけを証明します。"],
      ["運営者には何が見えますか？", "どのアカウントがどのグループに参加しているか（あなたに一覧を見せるため）と、判定結果の短い記録です。医療記録そのものは受け取りません。"],
      ["World ID は何を知りますか？", "このサイトでアカウントを作ったことだけです。どのグループに参加したかは伝わりません。"],
      ["病名での証明はいつから使えますか？", "傷病名は、電子カルテ情報共有サービスの本格運用（2027年予定）でマイナポータルから取得できるようになる見込みです。それまでは、処方薬や指定難病の認定で証明できるグループから開設します。"],
      ["証明の中身を自分で確認できますか？", "はい。証明ごとに監査レポートがあり、あなたが見た応答と検証者が受け取ったバイトを並べて比べられます。"],
    ],
    endTitle: "ひとりで抱えこまなくていい。",
    cta: "病名を探す",
    login: "ログイン",
  },
  en: {
    title: ["Talk with people who share your condition.", "Anonymously."],
    lede: "Anonymous communities for people with the same condition. You prove you belong with your own Myna Portal data, and show nothing beyond the fact that you qualify.",
    ledgerTitle: "What the group learns, and what it never does",
    learnsTitle: "Learns",
    learns: ["That you meet the group's criteria", "The one item used to decide, such as the matching diagnosis", "The display name you chose for this group"],
    neverTitle: "Never learns",
    never: ["Your name, address or date of birth", "Your My Number, which is never even read", "Your other diagnoses, medicines, hospitals or visit dates", "Which other groups you belong to"],
    stepsTitle: "How joining works",
    howLink: "See how the proof works in detail →",
    steps: [
      ["Find your condition", "Search every ICD-10 entry by name or code."],
      ["Create your account", "Verify once with World ID, then register a passkey."],
      ["Prove it with Myna Portal", "Show the group's verifier only the part that meets the criteria."],
      ["Join the board", "Talk somewhere only people with your condition can read."],
    ],
    principlesTitle: "What we hold to",
    principles: [
      ["Verified, not self-declared", "TLSNotary confirms the data came from myna.go.jp unaltered. No paperwork or screenshots."],
      ["One person, one account", "World ID stops anyone from opening a second account, which keeps out sock puppets and multi-account marketing."],
      ["A different name in every group", "You choose a display name per group, so other members can't connect the groups you're in."],
      ["No passwords", "Log in with a passkey: Touch ID, Face ID or your phone. Nothing to remember, nothing to leak."],
      ["Secret ballots", "Polls allow one vote per person. Not even our server keeps who voted for what."],
      ["The group runs its own verifier", "The patient group that decides membership checks the proof itself. No third-party notary."],
    ],
    groupsTitle: "Groups open now",
    groupsNote: ["For anything else,", "search", "your condition and register interest if there's no group yet."],
    faqTitle: "Questions",
    faq: [
      ["Is my My Number used?", "Your My Number itself is never read. The proof runs inside your own logged-in Myna Portal session and covers only the item needed."],
      ["What can the operators see?", "Which account belongs to which groups, so we can show you your list, and a short record of each verdict. We never receive your medical records."],
      ["What does World ID learn?", "Only that you created an account here. It is never told which groups you join."],
      ["When can I prove a diagnosis?", "Diagnoses are expected in Myna Portal once Japan's EHR sharing service is fully running, planned for 2027. Until then, we open groups that can be verified by prescriptions or 指定難病 certification."],
      ["Can I check what was revealed?", "Yes. Every proof has an audit report that lines up the response you saw against the bytes the verifier received."],
    ],
    endTitle: "You don't have to carry this alone.",
    cta: "Find your condition",
    login: "Log in",
  },
} satisfies Record<Lang, unknown>;

export default async function Landing() {
  const lang = await getLang();
  const t = COPY[lang];
  const groups = listOpenGroups();
  const me = await currentAccount();
  const search = `/search`;

  return (
    <div className={`landing ${display.variable}`} lang={lang}>
      <section className="l-hero">
        <div className="l-hero-copy">
          <h1>
            {/* Phrase chunks so the headline wraps between phrases, never mid-word. */}
            {t.title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="l-lede">{t.lede}</p>
          <div className="l-search">
            <DiseaseSearch lang={lang} />
          </div>
        </div>
        <RedactionDemo lang={lang} />
      </section>

      <section className="l-band">
        <div className="l-inner">
          <h2>{t.ledgerTitle}</h2>
          <div className="ledger">
            <div>
              <h3 className="yes">{t.learnsTitle}</h3>
              <ul>{t.learns.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h3 className="no">{t.neverTitle}</h3>
              <ul>{t.never.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section className="l-inner l-section">
        <h2>{t.stepsTitle}</h2>
        <ol className="l-steps">
          {t.steps.map(([h, p]) => (
            <li key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </li>
          ))}
        </ol>
        <p className="l-more">
          <Link href="/how-it-works">{t.howLink}</Link>
        </p>
      </section>

      <section className="l-inner l-section">
        <h2>{t.principlesTitle}</h2>
        <div className="l-principles">
          {t.principles.map(([h, p]) => (
            <div key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="l-inner l-section l-groups">
        <h2>{t.groupsTitle}</h2>
        <ul>
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`}>{g.name[lang]}</Link>
            </li>
          ))}
        </ul>
        <p className="l-note">
          {t.groupsNote[0]} <Link href={search}>{t.groupsNote[1]}</Link> {t.groupsNote[2]}
        </p>
      </section>

      <section className="l-inner l-section">
        <h2>{t.faqTitle}</h2>
        <div className="l-faq">
          {t.faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="l-end">
        <div className="l-inner">
          <h2>{t.endTitle}</h2>
          <div className="row">
            <Link className="button l-cta" href={search}>{t.cta}</Link>
            {!me && <Link className="l-login" href="/login">{t.login}</Link>}
          </div>
        </div>
      </section>
    </div>
  );
}
