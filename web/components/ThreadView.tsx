"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import Editor from "./Editor";
import Markdown from "./Markdown";
import WorldIdButton from "./WorldIdButton";
import { REACTIONS, type Post, type ThreadDetail } from "@/lib/board-shared";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import { fmtAgo, fmtTime } from "@/lib/format";
import type { WorldConfig } from "@/lib/world-config";

const REFRESH_MS = 5_000;

type Props = { groupId: string; memberId: number; initial: ThreadDetail; world: WorldConfig; devFakeWorld: boolean };

/** A Discourse-style topic: the opening post, numbered replies, reactions, and a reply composer. */
export default function ThreadView({ groupId, memberId, initial, world, devFakeWorld }: Props) {
  const router = useRouter();
  const { lang, t } = useT();
  const [thread, setThread] = useState(initial);
  // Unread divider: where this member had read up to when they opened the page (not refreshed).
  const [lastReadAt] = useState(initial.last_read_at);
  const [replyTo, setReplyTo] = useState<{ post: Post; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const refresh = async () => {
    try {
      setThread(await api<ThreadDetail>(`/api/threads/${thread.id}`));
    } catch (e) {
      if ((e as { status?: number }).status === 404) router.push(`/groups/${groupId}`);
    }
  };
  useEffect(() => {
    const i = setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const react = (kind: "t" | "r", id: number, emoji: string) => act(() => api("/api/reactions", { kind, id, emoji }));
  const del = (kind: "t" | "r", id: number) => {
    if (!confirm(t("削除しますか？", "Delete this post?"))) return;
    if (kind === "t") {
      void api("/api/posts", { kind, id }, "DELETE").then(() => router.push(`/groups/${groupId}`)).catch((e) => setError(errMsg(e)));
    } else void act(() => api("/api/posts", { kind, id }, "DELETE"));
  };
  const reply = (post: Post, n: number) => {
    setReplyTo({ post, n });
    composer.current?.focus();
    composer.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const live = thread.replies.filter((r) => !r.deleted);
  const participants = useMemo(() => new Set([thread.post.author, ...live.map((r) => r.author)]).size, [thread, live]);
  const lastReply = live.at(-1);
  // First reply by someone else that arrived after the previous visit.
  const firstUnread =
    lastReadAt === null ? -1 : thread.replies.findIndex((r) => !r.mine && !r.deleted && r.created_at > lastReadAt);
  const replyNumber = (id: number) => thread.replies.findIndex((r) => r.id === id) + 2;

  return (
    <div className="topic">
      <header className="topic-header">
        <h1>
          {thread.poll && <span className="chip">{t("📊 投票", "📊 Poll")}</span>} {thread.title}
        </h1>
        <div className="topic-stats">
          <span><strong>{live.length}</strong> {t("件の返信", live.length === 1 ? "reply" : "replies")}</span>
          <span><strong>{participants}</strong> {t("人が参加", participants === 1 ? "participant" : "participants")}</span>
          <span>{t("作成", "Created")} <time title={fmtTime(thread.post.created_at, lang)}>{fmtAgo(thread.post.created_at, lang)}</time></span>
          {lastReply && (
            <span>
              {t("最終返信", "Last reply")} <time title={fmtTime(lastReply.created_at, lang)}>{fmtAgo(lastReply.created_at, lang)}</time>
            </span>
          )}
        </div>
      </header>

      <div className="posts">
        <PostItem
          post={thread.post}
          n={1}
          op
          opAuthor={thread.post.author}
          onReact={(e) => react("t", thread.id, e)}
          onDelete={() => del("t", thread.id)}
          onReply={() => reply(thread.post, 1)}
        >
          {thread.poll && (
            <PollBox poll={thread.poll} memberId={memberId} world={world} devFakeWorld={devFakeWorld} onVoted={refresh} onError={setError} />
          )}
        </PostItem>

        {thread.replies.map((r, i) => (
          <Fragment key={r.id}>
            {i === firstUnread && (
              <div className="unread-divider" role="separator">
                <span>{t("前回からの新しい投稿", "New since your last visit")}</span>
              </div>
            )}
            <PostItem
              post={r}
              n={i + 2}
              opAuthor={thread.post.author}
              replyToN={r.quote ? replyNumber(r.quote.id) : undefined}
              onReact={(e) => react("r", r.id, e)}
              onDelete={() => del("r", r.id)}
              onReply={() => reply(r, i + 2)}
            />
          </Fragment>
        ))}
      </div>

      <ReplyForm
        threadId={thread.id}
        replyTo={replyTo}
        clearReplyTo={() => setReplyTo(null)}
        textarea={composer}
        onPosted={refresh}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PostItem({
  post,
  n,
  op,
  opAuthor,
  replyToN,
  onReact,
  onDelete,
  onReply,
  children,
}: {
  post: Post;
  n: number;
  op?: boolean;
  opAuthor: string;
  replyToN?: number;
  onReact: (e: string) => void;
  onDelete: () => void;
  onReply: () => void;
  children?: React.ReactNode;
}) {
  const { lang, t } = useT();
  if (post.deleted) {
    return (
      <article className="post deleted" id={`p${n}`}>
        <div className="post-gutter" />
        <div className="post-main small muted">
          #{n} · {t("この投稿は削除されました", "This post was deleted")}
        </div>
      </article>
    );
  }
  const counts = new Map(post.reactions.map((r) => [r.emoji as string, r]));
  return (
    <article className={`post${op ? " op" : ""}${post.mine ? " mine" : ""}`} id={`p${n}`}>
      <div className="post-gutter">
        <Avatar handle={post.author} size={40} />
      </div>
      <div className="post-main">
        <div className="post-head">
          <span className="post-author">{post.author}</span>
          {post.author === opAuthor && <span className="tag-op" title={t("トピック作成者", "Topic author")}>OP</span>}
          {post.mine && <span className="tag-you">{t("あなた", "you")}</span>}
          {replyToN && (
            <a className="reply-ref" href={`#p${replyToN}`}>
              ↪ #{replyToN}
            </a>
          )}
          <span className="post-spacer" />
          <time title={fmtTime(post.created_at, lang)}>{fmtAgo(post.created_at, lang)}</time>
          <a className="post-num" href={`#p${n}`}>#{n}</a>
        </div>
        {post.quote && (
          <a className="post-quote" href={replyToN ? `#p${replyToN}` : undefined}>
            <span className="post-quote-author">
              <Avatar handle={post.quote.author} size={18} /> {post.quote.author}
            </span>
            <span className="post-quote-text">
              {post.quote.deleted ? t("（削除されました）", "(deleted)") : post.quote.excerpt}
            </span>
          </a>
        )}
        {post.body ? <Markdown text={post.body} className="post-body" /> : null}
        {children}
        <div className="post-actions">
          <div className="reactions">
            {REACTIONS.map((e) => {
              const r = counts.get(e);
              return (
                <button key={e} type="button" className={`react${r?.mine ? " on" : ""}${r ? " has" : ""}`} onClick={() => onReact(e)} aria-pressed={!!r?.mine}>
                  <span>{e}</span>
                  {r && <span className="react-n">{r.count}</span>}
                </button>
              );
            })}
          </div>
          <span className="post-spacer" />
          {post.mine && (
            <button type="button" className="post-btn danger" onClick={onDelete}>{t("削除", "Delete")}</button>
          )}
          <button type="button" className="post-btn" onClick={onReply}>↩ {t("返信", "Reply")}</button>
        </div>
      </div>
    </article>
  );
}

function PollBox({ poll, memberId, world, devFakeWorld, onVoted, onError }: {
  poll: NonNullable<ThreadDetail["poll"]>;
  memberId: number;
  world: WorldConfig;
  devFakeWorld: boolean;
  onVoted: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const { t } = useT();
  // The server doesn't know who voted (secret ballot), so remember locally that this member did.
  const key = `voted-poll-${poll.id}-m${memberId}`;
  const [voted, setVoted] = useState(false);
  useEffect(() => {
    try {
      setVoted(localStorage.getItem(key) === "1");
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const markVoted = () => {
    setVoted(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable */
    }
    void onVoted();
  };

  return (
    <div className="poll stack">
      {poll.options.map((o) => {
        const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
        return (
          <div key={o.id} className="poll-opt">
            <div className="bar" style={{ width: `${pct}%` }} />
            <span className="lbl">{o.label}</span>
            <span className="small muted">{o.votes} ({pct}%)</span>
            {!voted && (
              <span className="row">
                <WorldIdButton
                  world={world}
                  className="secondary small-btn"
                  context={{ purpose: "poll", pollId: poll.id, optionId: o.id }}
                  label={t("投票", "Vote")}
                  onVerify={async (idkitResult) => {
                    await api(`/api/polls/${poll.id}/vote`, { optionId: o.id, idkitResult });
                  }}
                  onSuccess={markVoted}
                  onError={(m) => {
                    if (/already voted/.test(m)) markVoted();
                    onError(m);
                  }}
                />
                {devFakeWorld && (
                  <button
                    type="button"
                    className="link small"
                    onClick={() => api("/api/dev/fake-world-id", { purpose: "poll", pollId: poll.id, optionId: o.id }).then(markVoted, (e) => onError(errMsg(e)))}
                  >
                    (dev)
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      <p className="small muted">
        {t(
          `${poll.total} 票 · 秘密投票: World ID で1人1票。誰がどれに投票したかはサーバーにも記録されません。`,
          `${poll.total} votes · Secret ballot: one vote per human via World ID; not even the server records who voted for what.`,
        )}
      </p>
    </div>
  );
}


function ReplyForm({
  threadId,
  replyTo,
  clearReplyTo,
  textarea,
  onPosted,
}: {
  threadId: number;
  replyTo: { post: Post; n: number } | null;
  clearReplyTo: () => void;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  onPosted: () => Promise<void>;
}) {
  const { t } = useT();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Replying to the opening post is a plain reply; replying to a reply quotes it.
      const quoteId = replyTo && replyTo.n > 1 ? replyTo.post.id : undefined;
      await api(`/api/threads/${threadId}/replies`, { body, quoteId });
      setBody("");
      clearReplyTo();
      await onPosted();
      requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="composer-card reply-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="composer-context small">
        {replyTo && replyTo.n > 1 ? (
          <>
            <span>
              ↪ {t(`#${replyTo.n} ${replyTo.post.author} さんに返信`, `Replying to #${replyTo.n} ${replyTo.post.author}`)}
            </span>
            <button type="button" className="icon" aria-label={t("返信先を解除", "Cancel reply-to")} onClick={clearReplyTo}>×</button>
          </>
        ) : (
          <span>{t("トピックに返信", "Reply to the topic")}</span>
        )}
      </div>
      <Editor
        value={body}
        onChange={setBody}
        onSubmit={() => void submit()}
        textareaRef={textarea}
        rows={4}
        placeholder={t("返信を書く", "Write a reply")}
      />
      <div className="composer-actions">
        <button type="submit" disabled={busy || !body.trim()}>{busy ? "…" : t("返信", "Reply")}</button>
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}
