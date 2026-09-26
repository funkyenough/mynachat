"use client";

import { createContext, useContext, useMemo } from "react";
import { translator, type Lang, type T } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: "ja", t: translator("ja") });

/** Makes the page language available to client components (set in the root layout). */
export default function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: translator(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `const { lang, t } = useT(); t("日本語", "English")` */
export const useT = () => useContext(Ctx);
