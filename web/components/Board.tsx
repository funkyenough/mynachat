"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ThreadSummary } from "@/lib/board-shared";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import { fmtAgo } from "@/lib/format";

const REFRESH_MS = 10_000;
type Sort = "active" | "new" | "replies";

/** Thread list with search, sorting, live refresh and a composer (with optional poll). */
export default function Board({ groupId, initial }: { groupId: string; initial: ThreadSummary[] }) {
  const { lang, t } = useT();
  const [threads, setThreads] = useState(initial);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("active");
  const [composing, setComposing] = useState(false);

  const refresh = async () => {
    try {
      setThreads((await api<{ threads: ThreadSummary[] }>(`/api/groups/${groupId}/threads`)).threads);
    } catch {
      /* next tick */
    }
  };
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const shown = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const list = nq ? threads.filter((th) => `${th.title} ${th.excerpt} ${th.author}`.toLowerCase().includes(nq)) : threads;
    const key: Record<Sort, (t: ThreadSummary) => number> = {
      active: (th) => th.last_activity,
      new: (th) => th.created_at,
      replies: (th) => th.reply_count,
    };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [threads, q, sort]);

  return (
    <div className="stack">
      <div className="toolbar">
        <input type="search" placeholder={t("スレッドを検索", "Search threads")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs" role="tablist">
          {([["active", t("最新の活動", "Active")], ["new", t("新着", "New")], ["replies", t("返信数", "Replies")]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? "tab on" : "tab"} onClick={() => setSort(k)}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setComposing((c) => !c)}>{composing ? t("閉じる", "Close") : t("＋ 新しいスレッド", "+ New thread")}</button>
      </div>

      {composing && (
        <Composer
          groupId={groupId}
          onDone={() => {
            setComposing(false);
            void refresh();
          }}
        />
      )}

      {shown.length === 0 ? (
        <div className="card empty">
          {threads.length === 0 ? (
            <>
              <p><strong>{t("まだスレッドはありません", "No threads yet")}</strong></p>
              <p className="muted small">{t("最初の話題を始めましょう。質問、体験談、アンケートなど。", "Start the first one: a question, your experience, or a poll.")}</p>
            </>
          ) : (
            <p className="muted">{t("該当するスレッドはありません", "No threads match.")}</p>
          )}
        </div>
      ) : (
        <ul className="threads">
          {shown.map((th) => (
            <li key={th.id}>
              <Link href={`/groups/${groupId}/threads/${th.id}`} className="thread-row">
                <span className="t-main">
                  <span className="t-title">
                    {th.has_poll ? <span className="badge">{t("📊 投票", "📊 Poll")}</span> : null} {th.title}
                  </span>
                  {th.excerpt && <span className="t-excerpt muted small">{th.excerpt}</span>}
                  <span className="small muted">
                    <span className="pseudo">{th.author}</span>{th.mine ? ` (${t("あなた", "you")})` : ""} · {fmtAgo(th.created_at, lang)}
                  </span>
                </span>
                <span className="t-stats small muted">
                  <span className="n">{th.reply_count}</span> {t("件の返信", th.reply_count === 1 ? "reply" : "replies")}<br />
                  {fmtAgo(th.last_activity, lang)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const router = useRouter();
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [poll, setPoll] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api(`/api/groups/${groupId}/threads`, { title, body, poll: poll?.filter((o) => o.trim()) });
      onDone();
      router.push(`/groups/${groupId}/threads/${id}`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <input type="text" placeholder={t("タイトル", "Title")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
      <textarea placeholder={t("本文", "What's on your mind?")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} rows={5} />
      {poll ? (
        <div className="stack poll-edit">
          <div className="small">
            <strong>{t("📊 投票", "📊 Poll")}</strong>{" "}
            <span className="muted">{t("— 秘密投票。World ID で1人1票、誰が何に投票したかは記録されません", "Secret ballot: one vote per human via World ID; who voted for what is never stored.")}</span>
          </div>
          {poll.map((o, i) => (
            <div className="row" key={i}>
              <input
                type="text"
                placeholder={t(`選択肢 ${i + 1}`, `Option ${i + 1}`)}
                value={o}
                maxLength={100}
                onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ flex: 1 }}
              />
              {poll.length > 2 && (
                <button type="button" className="icon" aria-label="remove option" onClick={() => setPoll(poll.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          <div className="row">
            {poll.length < 8 && <button type="button" className="secondary" onClick={() => setPoll([...poll, ""])}>{t("＋ 選択肢", "+ Option")}</button>}
            <button type="button" className="link" onClick={() => setPoll(null)}>{t("投票を削除", "Remove poll")}</button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="secondary" onClick={() => setPoll(["", ""])}>{t("📊 投票を追加", "📊 Add poll")}</button>
        </div>
      )}
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? "…" : t("投稿", "Post")}</button>
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}
