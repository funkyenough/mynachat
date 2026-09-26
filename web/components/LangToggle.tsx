"use client";

import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/lang";

/**
 * 日本語 / English switch for the current page. The choice is remembered (see middleware.ts).
 * Plain links on purpose: a client-side navigation would keep the old layout (and header) language.
 */
export default function LangToggle({ lang }: { lang: Lang }) {
  const path = usePathname();
  return (
    <span className="lang-toggle" role="group" aria-label="Language">
      <a href={`${path}?lang=ja`} aria-current={lang === "ja" ? "true" : undefined} lang="ja">日本語</a>
      <a href={`${path}?lang=en`} aria-current={lang === "en" ? "true" : undefined} lang="en">EN</a>
    </span>
  );
}
