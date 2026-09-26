import type { Lang } from "./i18n";

export const fmtTime = (ms: number, lang: Lang = "ja") =>
  new Date(ms).toLocaleString(lang === "ja" ? "ja-JP" : "en-GB", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "short",
  });

/** "3分前" / "3m ago" for recent times, the date otherwise. */
export function fmtAgo(ms: number, lang: Lang = "ja", now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  const ja = lang === "ja";
  if (s < 60) return ja ? "たった今" : "just now";
  if (s < 3600) return ja ? `${Math.floor(s / 60)}分前` : `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return ja ? `${Math.floor(s / 3600)}時間前` : `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return ja ? `${Math.floor(s / 86400)}日前` : `${Math.floor(s / 86400)}d ago`;
  return fmtTime(ms, lang);
}
