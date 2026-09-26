import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LangProvider from "@/components/LangProvider";
import LangToggle from "@/components/LangToggle";
import { currentAccount } from "@/lib/auth";
import { getLang } from "@/lib/lang";
import "./globals.css";

export const metadata: Metadata = {
  title: "mynachat",
  description: "Anonymous patient groups, eligibility proven from your own Myna Portal data",
};

const NAV = {
  ja: { search: "病名検索", how: "仕組み", limits: "制限事項", login: "ログイン", signup: "新規登録", tagline: "同じ病気の人と、匿名で。" },
  en: { search: "Search", how: "How it works", limits: "Limitations", login: "Log in", signup: "Sign up", tagline: "Anonymous communities for people who share a condition." },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang] = await Promise.all([currentAccount(), getLang()]);
  const t = NAV[lang];
  return (
    <html lang={lang}>
      <body>
        <header className="site">
          <div>
            <Link href="/" className="brand">
              <Image src="/logo.png" alt="" width={28} height={28} priority />
              <strong>mynachat</strong>
            </Link>
            <nav className="site-nav small" aria-label={lang === "ja" ? "ページ" : "Pages"}>
              <Link href="/search">{t.search}</Link>
              <Link href="/how-it-works" className="nav-secondary">{t.how}</Link>
              <Link href="/limitations" className="nav-secondary">{t.limits}</Link>
            </nav>
            <span className="spacer" />
            <div className="site-actions row small">
              {me ? (
                <Link href="/account" className="pill">
                  👤 {me.username}
                </Link>
              ) : (
                <>
                  <Link href="/login">{t.login}</Link>
                  <Link href="/signup" className="button small-btn">
                    {t.signup}
                  </Link>
                </>
              )}
              <LangToggle lang={lang} />
            </div>
          </div>
        </header>
        <main>
          <LangProvider lang={lang}>{children}</LangProvider>
        </main>
        <footer className="site">
          <div>
            <span>mynachat · {t.tagline}</span>
            <span className="spacer" />
            <Link href="/how-it-works">{t.how}</Link>
            <Link href="/limitations">{t.limits}</Link>
            <a href="https://github.com/funkyenough/mynachat" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
