import type { Metadata } from "next";
import Link from "next/link";
import RedactionDemo from "@/components/RedactionDemo";
import { getT } from "@/lib/lang";
import { display } from "../fonts";
import "../info.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("仕組み · mynachat", "How it works · mynachat") };
}

export default async function HowItWorks() {
  const { lang, t } = await getT();

  return (
    <article className={`info ${display.variable}`}>
      <h1>{t("仕組み", "How it works")}</h1>
      <p className="info-lede">
        {t(
          "mynachat は、マイナポータルにあるあなた自身のデータで「参加条件を満たしている」ことだけを証明します。記録そのものは、患者会にも運営にも渡りません。その仕組みを順番に説明します。",
          "mynachat proves one thing from your own Myna Portal data: that you meet a group's criteria. Your records themselves never reach the group or the operators. Here is how, step by step.",
        )}
      </p>
      <ul className="info-toc">
        <li><a href="#parties">{t("登場人物", "Who's involved")}</a></li>
        <li><a href="#steps">{t("参加までの6ステップ", "The six steps")}</a></li>
        <li><a href="#stored">{t("どこに何が残るか", "What is stored where")}</a></li>
        <li><a href="#audit">{t("監査レポート", "Audit reports")}</a></li>
        <li><a href="#tech">{t("使っている技術", "Technology")}</a></li>
      </ul>

      <h2 id="parties">{t("登場人物", "Who's involved")}</h2>
      <div className="parties" role="img" aria-label={t("あなたの端末、myna.go.jp、患者会の検証者の関係図", "Diagram of your device, myna.go.jp and the group's verifier")}>
        <div className="party you p-you">
          <strong>{t("あなたの端末", "Your device")}</strong>
          <span>{t("ブラウザと mynachat 拡張機能。マイナポータルのログインはここだけ。", "Browser plus the mynachat extension. Your Myna Portal login stays here.")}</span>
        </div>
        <div className="link-h l-tls">{t("TLS 通信（暗号化）", "TLS (encrypted)")}</div>
        <div className="party p-myna">
          <strong>myna.go.jp</strong>
          <span>{t("マイナポータル。普段どおりにあなたのデータを返すだけ。", "Myna Portal. It just answers as it always does.")}</span>
        </div>
        <div className="link-v l-mpc">{t("TLS の鍵を分け合う (MPC)", "Share the TLS keys (MPC)")}</div>
        <div className="link-v l-relay">{t("暗号化されたバイトを中継", "Relays encrypted bytes")}</div>
        <div className="party p-verifier">
          <strong>{t("患者会の検証者", "The group's verifier")}</strong>
          <span>
            {t(
              "証明を確かめて参加を判定します。見えるのは、あなたが見せると決めた部分だけ。",
              "Checks the proof and decides membership. It sees only what you choose to reveal.",
            )}
          </span>
        </div>
      </div>
      <p className="parties-note">
        {t(
          "ほかに、World ID（1人1アカウントの確認）と mynachat のサーバー（アカウントと掲示板）があります。",
          "Also involved: World ID (one account per person) and the mynachat server (accounts and boards).",
        )}
      </p>

      <h2 id="steps">{t("参加までの6ステップ", "The six steps")}</h2>
      <ol className="info-steps">
        <li>
          <h3>{t("World ID でアカウントを作る", "Create an account with World ID")}</h3>
          <p>
            {t(
              "World App で一度だけ本人確認します。返ってくるのは「このアプリ専用の番号（nullifier）」だけで、同じ人なら毎回同じ番号になります。これを保存するので、同じ人が2つ目のアカウントを作ることはできません。名前や顔写真は送られません。",
              "You verify once in World App. All the app receives is a number specific to this app (a nullifier), which is the same for the same person every time. Storing it means nobody can open a second account. No name or photo is sent.",
            )}
          </p>
        </li>
        <li>
          <h3>{t("パスキーでログイン", "Log in with a passkey")}</h3>
          <p>
            {t(
              "続けてパスキー（Touch ID、Face ID、スマートフォン）を登録します。以後のログインはパスキーだけ。パスワードは存在しないので、漏れることもありません。",
              "Then you register a passkey (Touch ID, Face ID or your phone). From then on, a passkey is all you need. There is no password to leak.",
            )}
          </p>
        </li>
        <li>
          <h3>{t("マイナポータルにログイン", "Log in to Myna Portal")}</h3>
          <p>
            {t(
              "グループに参加するとき、拡張機能がマイナポータルを開きます。マイナンバーカードでいつもどおりログインしてください。ログインの情報（セッション Cookie）はあなたの端末から出ません。",
              "When you join a group, the extension opens Myna Portal and you log in with your My Number Card as usual. Your login (the session cookie) never leaves your device in readable form.",
            )}
          </p>
        </li>
        <li>
          <h3>{t("MPC-TLS で処方データを取得", "Fetch your prescriptions over MPC-TLS")}</h3>
          <p>
            {t(
              "拡張機能は、患者会の検証者と「二人一組」で myna.go.jp と TLS 通信をします（TLSNotary の MPC-TLS）。通信の鍵は2者で分け合うので、検証者だけでは中身を読めず、あなただけではマイナポータルの返事を偽造できません。途中の中継が扱うのは暗号化されたバイトだけです。",
              "The extension and the group's verifier act together as one TLS client to myna.go.jp (TLSNotary's MPC-TLS). The session keys are split between them, so the verifier alone can't read the traffic and you alone can't forge Myna Portal's reply. The relay in between only ever handles encrypted bytes.",
            )}
          </p>
        </li>
        <li>
          <h3>{t("必要な1項目だけを見せる", "Reveal only the item that matters")}</h3>
          <p>
            {t(
              "応答が届いたら、拡張機能はグループの薬リストに合う薬の名前を1つだけ選んで開示します。見せるのは、リクエストのパスとその1項目だけ。ほかの薬、医療機関、日付は、検証者の手元ではゼロで埋まったままです。",
              "Once the reply arrives, the extension picks one drug name that matches the group's list and reveals only that, plus the request path. Every other drug, clinic and date stays as zeros in the verifier's copy.",
            )}
          </p>
          <div className="info-demo">
            <RedactionDemo lang={lang} />
            <p className="parties-note">
              {t(
                "例は、2027年に予定されている傷病名データです。処方薬でも仕組みは同じで、開示されるのは薬の名前1つだけです。",
                "This example uses the diagnosis list planned for 2027. Prescriptions work the same way, revealing a single drug name.",
              )}
            </p>
          </div>
        </li>
        <li>
          <h3>{t("検証者が判定して、参加", "The verifier decides, and you join")}</h3>
          <p>
            {t(
              "検証者は、通信相手が本当に myna.go.jp だったこと（証明書チェーン）、パスが処方データのものであること、開示された薬がグループのリストにあることを確かめ、結果を mynachat に送ります。合格なら、このグループ専用の表示名を選んで掲示板に入れます。薬が合わなければ、通信は最後まで行われたうえで不合格になります。",
              "The verifier checks that the other side really was myna.go.jp (certificate chain), that the path is the prescription endpoint, and that the revealed drug is on the group's list, then sends the verdict to mynachat. If you pass, you pick a display name for this group and enter the board. If no drug matches, the session still completes and the verifier rejects it.",
            )}
          </p>
        </li>
      </ol>
      <p>
        {t(
          "掲示板のアンケートも World ID で1人1票です。投票ごとに別の番号を使い、その番号だけを保存するので、誰がどれに投票したかはサーバーにも残りません。",
          "Board polls also use World ID for one vote per person. Each poll uses its own number, and only that number is stored, so not even the server records who voted for what.",
        )}
      </p>

      <h2 id="stored">{t("どこに何が残るか", "What is stored where")}</h2>
      <table className="info-table">
        <thead>
          <tr>
            <th>{t("場所", "Where")}</th>
            <th>{t("残るもの", "What")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t("あなたの端末", "Your device")}</td>
            <td>{t("マイナポータルの応答の全体（拡張機能のメモリ内、ブラウザを閉じると消えます）、パスキーの秘密鍵。", "The full Myna Portal response (in the extension's memory, gone when the browser closes) and your passkey's private key.")}</td>
          </tr>
          <tr>
            <td>{t("患者会の検証者", "The group's verifier")}</td>
            <td>{t("開示された部分（パスと薬の名前1つ）と、監査用の記録。", "The revealed parts (the path and one drug name) and an audit record.")}</td>
          </tr>
          <tr>
            <td>{t("mynachat のサーバー", "mynachat's server")}</td>
            <td>{t("ユーザー名、World ID の番号、パスキーの公開鍵、参加グループと表示名、判定の短い記録（例: 「ビラノアの処方」）、投稿。", "Username, World ID number, passkey public key, your groups and display names, a short verdict record (e.g. \"prescribed ビラノア\"), and posts.")}</td>
          </tr>
          <tr>
            <td>World ID</td>
            <td>{t("mynachat 向けの証明が作られたこと。どの病気のグループに参加したかは伝わりません。", "That a proof was made for mynachat. It is never told which condition groups you join.")}</td>
          </tr>
        </tbody>
      </table>

      <h2 id="audit">{t("監査レポート", "Audit reports")}</h2>
      <p>
        {t(
          "証明ごとに監査レポートがあります。あなたの拡張機能が見た応答と、検証者が受け取ったバイトを並べて表示し、「Cookie が開示されていない」「開示していないバイトは検証者側でゼロ」「証明書は myna.go.jp のもの」などを一つずつ確認できます。",
          "Every proof has an audit report. It lines up the response your extension saw against the bytes the verifier received, and checks items one by one: the cookie was not revealed, every unrevealed byte is zero on the verifier's side, the certificate is for myna.go.jp, and so on.",
        )}
      </p>

      <h2 id="tech">{t("使っている技術", "Technology")}</h2>
      <ul>
        <li>{t("TLSNotary（tlsn v0.1.0-alpha.15）: 拡張機能の WASM 証明者と Rust の検証者", "TLSNotary (tlsn v0.1.0-alpha.15): a WASM prover in the extension and a Rust verifier")}</li>
        <li>{t("World ID 4.0（IDKit）: 1人1アカウントと秘密投票", "World ID 4.0 (IDKit): one account per person and secret ballots")}</li>
        <li>{t("パスキー（WebAuthn）: パスワードのないログイン", "Passkeys (WebAuthn): passwordless login")}</li>
        <li>{t("ICD-10（2013年版）: e-Stat の日本語分類と CMS の英語名", "ICD-10 (2013): Japanese titles from e-Stat, English titles from CMS")}</li>
        <li>{t("Next.js、SQLite、Fly.io", "Next.js, SQLite, Fly.io")}</li>
      </ul>

      <div className="info-next">
        <p>{t("できないこと、まだ解決していないことも正直に書いています。", "We're just as clear about what it can't do yet.")}</p>
        <Link className="button" href="/limitations">{t("制限事項を読む", "Read the limitations")}</Link>
      </div>
    </article>
  );
}
