import type { Metadata } from "next";
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
  ja: { search: "病名検索", login: "ログイン", signup: "新規登録" },
  en: { search: "Search", login: "Log in", signup: "Sign up" },
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
              <strong>mynachat</strong>
            </Link>
            <nav className="row small">
              <Link href="/search">{t.search}</Link>
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
            </nav>
          </div>
        </header>
        <main>
          <LangProvider lang={lang}>{children}</LangProvider>
        </main>
      </body>
    </html>
  );
}
