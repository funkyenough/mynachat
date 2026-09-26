"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ThreadSummary } from "@/lib/board-shared";
import Avatar from "./Avatar";
import Editor from "./Editor";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import { fmtAgo, fmtTime } from "@/lib/format";

const REFRESH_MS = 10_000;
type Tab = "latest" | "new" | "top" | "unread";

const isUnread = (th: ThreadSummary) => th.unseen || th.new_replies > 0;

/** Discourse-style topic list: search, tabs, unread markers, participants, live refresh. */
export default function Board({ groupId, initial }: { groupId: string; initial: ThreadSummary[] }) {
  const { lang, t } = useT();
  const [threads, setThreads] = useState(initial);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("latest");
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

  const unreadCount = threads.filter(isUnread).length;
  const shown = useMemo(() => {
    const nq = q.trim().toLowerCase();
    let list = nq ? threads.filter((th) => `${th.title} ${th.excerpt} ${th.author}`.toLowerCase().includes(nq)) : threads;
    if (tab === "unread") list = list.filter(isUnread);
    const key: Record<Tab, (th: ThreadSummary) => number> = {
      latest: (th) => th.last_activity,
      unread: (th) => th.last_activity,
      new: (th) => th.created_at,
      top: (th) => th.likes * 1000 + th.reply_count,
    };
    return [...list].sort((a, b) => key[tab](b) - key[tab](a));
  }, [threads, q, tab]);

  const tabs: [Tab, string][] = [
    ["latest", t("最新", "Latest")],
    ["new", t("新着", "New")],
    ["top", t("人気", "Top")],
    ["unread", unreadCount ? t(`未読 (${unreadCount})`, `Unread (${unreadCount})`) : t("未読", "Unread")],
  ];

  return (
    <div className="forum">
      <div className="forum-toolbar">
        <nav className="forum-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <input className="forum-search" type="search" placeholder={t("トピックを検索", "Search topics")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="forum-new" onClick={() => setComposing((c) => !c)} aria-expanded={composing}>
          {composing ? t("閉じる", "Close") : t("＋ 新しいトピック", "+ New topic")}
        </button>
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
        <div className="forum-empty">
          {threads.length === 0 ? (
            <>
              <p className="forum-empty-title">{t("まだトピックはありません", "No topics yet")}</p>
              <p className="muted">
                {t("最初の話題を始めましょう。質問、体験談、アンケートなど。", "Start the first one: a question, your experience, or a poll.")}
              </p>
              <button onClick={() => setComposing(true)}>{t("＋ 新しいトピック", "+ New topic")}</button>
            </>
          ) : (
            <p className="muted">
              {tab === "unread" ? t("未読のトピックはありません", "You're all caught up.") : t("該当するトピックはありません", "No topics match.")}
            </p>
          )}
        </div>
      ) : (
        <div className="topic-list" role="table" aria-label={t("トピック", "Topics")}>
          <div className="topic-head" role="row">
            <span role="columnheader">{t("トピック", "Topic")}</span>
            <span role="columnheader" className="col-posters" />
            <span role="columnheader" className="col-num">{t("返信", "Replies")}</span>
            <span role="columnheader" className="col-num">{t("活動", "Activity")}</span>
          </div>
          {shown.map((th) => (
            <Link key={th.id} href={`/groups/${groupId}/threads/${th.id}`} className={`topic-row${isUnread(th) ? " unread" : ""}`} role="row">
              <span className="topic-main" role="cell">
                <span className="topic-title">
                  {th.has_poll ? <span className="chip">{t("📊 投票", "📊 Poll")}</span> : null}
                  <span className="topic-title-text">{th.title}</span>
                  {th.unseen && <span className="badge-new">{t("新着", "new")}</span>}
                  {th.new_replies > 0 && <span className="badge-count" title={t("新しい返信", "new replies")}>{th.new_replies}</span>}
                </span>
                {th.excerpt && <span className="topic-excerpt">{th.excerpt}</span>}
                <span className="topic-meta">
                  <span>{th.author}</span>
                  {th.likes > 0 && <span>👍 {th.likes}</span>}
                  <span className="only-narrow">
                    {t(`返信 ${th.reply_count}`, `${th.reply_count} ${th.reply_count === 1 ? "reply" : "replies"}`)} · {fmtAgo(th.last_activity, lang)}
                  </span>
                </span>
              </span>
              <span className="topic-posters col-posters" role="cell">
                {th.participants.map((h, i) => (
                  <span key={h} className={i === 0 ? "poster op" : "poster"}>
                    <Avatar handle={h} size={26} />
                  </span>
                ))}
              </span>
              <span className={`col-num topic-replies${th.reply_count >= 10 ? " hot" : ""}`} role="cell">{th.reply_count}</span>
              <span
                className="col-num topic-activity"
                role="cell"
                title={`${t("最終投稿", "Last post")}: ${th.last_poster} · ${fmtTime(th.last_activity, lang)}`}
              >
                {fmtAgo(th.last_activity, lang)}
              </span>
            </Link>
          ))}
        </div>
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

  async function submit() {
    if (!title.trim()) return setError(t("タイトルを入力してください", "Add a title"));
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
    <form
      className="composer-card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        className="composer-title"
        type="text"
        placeholder={t("タイトル：何について話しますか？", "Title: what's this about?")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
        autoFocus
      />
      <Editor
        value={body}
        onChange={setBody}
        onSubmit={() => void submit()}
        rows={6}
        placeholder={t("詳しく書いてください（任意）", "Add details (optional)")}
      />
      {poll ? (
        <div className="poll-edit">
          <div className="small">
            <strong>{t("📊 投票", "📊 Poll")}</strong>{" "}
            <span className="muted">
              {t("秘密投票。World ID で1人1票、誰が何に投票したかは記録されません", "Secret ballot: one vote per human via World ID; who voted for what is never stored.")}
            </span>
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
                <button type="button" className="icon" aria-label={t("選択肢を削除", "Remove option")} onClick={() => setPoll(poll.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="row">
            {poll.length < 8 && (
              <button type="button" className="secondary" onClick={() => setPoll([...poll, ""])}>{t("＋ 選択肢", "+ Option")}</button>
            )}
            <button type="button" className="link" onClick={() => setPoll(null)}>{t("投票を削除", "Remove poll")}</button>
          </div>
        </div>
      ) : null}
      <div className="composer-actions">
        <button type="submit" disabled={busy}>{busy ? "…" : t("トピックを作成", "Create topic")}</button>
        {!poll && (
          <button type="button" className="secondary" onClick={() => setPoll(["", ""])}>{t("📊 投票を追加", "📊 Add poll")}</button>
        )}
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}
