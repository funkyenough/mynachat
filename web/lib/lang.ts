// The visitor's language for single-language UI (landing page, site header).
// middleware.ts resolves it once per request: ?lang= > the "lang" cookie > Accept-Language.
import { headers } from "next/headers";

export type Lang = "ja" | "en";
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
