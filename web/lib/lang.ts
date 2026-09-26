// The visitor's language. middleware.ts resolves it once per request:
// ?lang= > the "lang" cookie > Accept-Language. Server-only; client code uses useT().
import { headers } from "next/headers";
import { translator, type Lang } from "./i18n";

export type { Lang } from "./i18n";
export const LANG_HEADER = "x-mnd-lang";
export const LANG_COOKIE = "lang";

export const isLang = (v: unknown): v is Lang => v === "ja" || v === "en";

/** Japanese unless the browser's first preference is English. */
export function fromAcceptLanguage(accept: string | null): Lang {
  return /^\s*en\b/i.test(accept ?? "") ? "en" : "ja";
}

export async function getLang(): Promise<Lang> {
  const v = (await headers()).get(LANG_HEADER);
  return isLang(v) ? v : "ja";
}

/** Language and translator for a server component: `const { lang, t } = await getT();` */
export async function getT() {
  const lang = await getLang();
  return { lang, t: translator(lang) };
}
