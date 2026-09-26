import Link from "next/link";
import DiseaseSearch from "@/components/DiseaseSearch";
import RedactionDemo from "@/components/RedactionDemo";
import { listOpenGroups } from "@/lib/groups";
import { getLang, type Lang } from "@/lib/lang";
import { headingFonts } from "./fonts";
import "./landing.css";

export const dynamic = "force-dynamic";

const COPY = {
  ja: {
    title: ["同じ病気の人と、", "匿名でつながろう。"],
    lede: "mynachat は、同じ病気の人どうしが出会える参加者限定の掲示板です。それ以外のことを明かす必要はありません。",
    problemTitle: "患者会には、信頼の問題があります",
    problemIntro:
      "オンラインの患者会は、希少疾患のある人にとって心強い支えになります。タイムリーで役立つ情報を共有でき、つらいときには気持ちを分かち合える場所です。けれども、匿名のままでいたい患者も多く、そこには板挟みがあります。",
    problems: [
      ["公開のグループ", "誰でも参加できるため、その病気ではない人や、営業目的など利害の対立する人も入ってきます。"],
      [
        "非公開のグループ",
        "より安全ですが、見つけにくいのが難点です。参加者を一人ずつ審査する人が必要で、その審査役の手元には、悪用されかねない医療情報が集まってしまいます。",
      ],
    ],
    ledgerTitle: "グループに伝わること、伝わらないこと",
    learnsTitle: "伝わること",
    learns: ["1人1アカウントの本人であること", "同じ病名であること"],
    neverTitle: "伝わらないこと",
    never: [
      "氏名、住所、生年月日",
      "ほかの病名、薬、医療機関、受診日",
      "あなたが参加しているほかのグループ",
    ],
    groupsTitle: "いま参加できるグループ",
    groupsNote: ["ほかの病名は", "検索", "から。グループがなければ参加希望を登録できます。"],
  },
  en: {
    title: ["Connect with people who share your condition,", "anonymously."],
    lede: "mynachat is a permissioned message board where people with the same disease can find each other, without revealing anything more about themselves.",
    problemTitle: "Online patient groups have a trust problem",
    problemIntro:
      "Online patient groups can be a lifeline for people with rare diseases. They offer a community for sharing timely, valuable information, and provide emotional support and solidarity during difficult times. But many patients would rather stay anonymous, and that forces a tradeoff.",
    problems: [
      [
        "Public groups",
        "Anyone can join, including people who don't have the disease or who have conflicting interests, such as salespeople.",
      ],
      [
        "Private groups",
        "Safer, but hard to find. Someone has to review each applicant, and that reviewer ends up holding sensitive medical information that could be misused.",
      ],
    ],
    ledgerTitle: "What the group learns, and what it never does",
    learnsTitle: "Learns",
    learns: ["That you are a unique person", "That you share the same diagnosis"],
    neverTitle: "Never learns",
    never: [
      "Your name, address, dob",
      "Your other diagnoses, medicines, hospitals or visit dates",
      "Which other groups you belong to",
    ],
    groupsTitle: "Active Groups",
    groupsNote: ["For anything else,", "search", "your condition and register interest if there's no group yet."],
  },
} satisfies Record<Lang, unknown>;

export default async function Landing() {
  const lang = await getLang();
  const t = COPY[lang];
  const groups = listOpenGroups();
  const search = `/search`;

  return (
    <div className={`landing ${headingFonts}`} lang={lang}>
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

      <section className="l-inner l-section l-problem">
        <h2>{t.problemTitle}</h2>
        <p className="l-problem-intro">{t.problemIntro}</p>
        <div className="l-tradeoff">
          {t.problems.map(([h, p]) => (
            <div key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="l-band">
        <div className="l-inner">
          <h2>{t.ledgerTitle}</h2>
          <div className="ledger">
            <div>
              <h3 className="yes">{t.learnsTitle}</h3>
              <ul>
                {t.learns.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="no">{t.neverTitle}</h3>
              <ul>
                {t.never.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
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
    </div>
  );
}
