import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "mynamedical",
  description: "Anonymous patient groups, eligibility proven from your own Myna Portal data",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site">
          <div>
            <Link href="/"><strong>mynamedical</strong></Link>
            <span className="muted small">匿名の患者コミュニティ / Anonymous patient groups</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
