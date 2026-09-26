// Language helpers usable on both server and client (no server-only imports here).
export type Lang = "ja" | "en";

/** `t("日本語", "English")` picks the string (or node) for the language. */
export type T = <V>(ja: V, en: V) => V;
export const translator = (lang: Lang): T => (ja, en) => (lang === "ja" ? ja : en);

/** The page language in the browser, from <html lang> (set by the root layout). */
export const docLang = (): Lang =>
  typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ja";
