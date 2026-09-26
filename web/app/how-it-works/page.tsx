import type { Metadata } from "next";
import Link from "next/link";
import ProofSequence from "@/components/ProofSequence";
import RedactionDemo from "@/components/RedactionDemo";
import { getT } from "@/lib/lang";
import { headingFonts } from "../fonts";
import "../info.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("仕組み · mynachat", "How it works · mynachat") };
}

export default async function HowItWorks() {
  const { lang, t } = await getT();

  return (
    <article className={`info ${headingFonts}`}>
      <h1>{t("仕組み", "How it works")}</h1>
      <p className="info-lede">
        {t(
          "mynachat は、マイナポータルにあるあなた自身のデータで「参加条件を満たしている」ことだけを証明します。記録そのものは、患者会にも運営にも渡りません。その仕組みを順番に説明します。",
          "mynachat proves one thing from your own Myna Portal data: that you meet a group's criteria. Your records themselves never reach the group or the operators. Here is how, step by step.",
        )}
      </p>
      <ProofSequence />

      <h2 id="verifier-view">{t("検証者に見えるもの", "What the verifier sees")}</h2>
      <p>
        {t(
          "同じ応答でも、あなたの画面と検証者の手元ではこれだけ違います。例は2027年予定の傷病名データですが、処方薬でも開示されるのは薬の名前1つだけです。",
          "The same reply, as you see it and as the verifier does. The example is the diagnosis list planned for 2027; with prescriptions, only a single drug name is revealed.",
        )}
      </p>
      <RedactionDemo lang={lang} />

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
