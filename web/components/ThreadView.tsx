"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WorldIdButton from "./WorldIdButton";
import { REACTIONS, type Post, type ThreadDetail } from "@/lib/board-shared";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";
import { fmtAgo, fmtTime } from "@/lib/format";
import type { WorldConfig } from "@/lib/world-config";

const REFRESH_MS = 5_000;

type Props = { groupId: string; memberId: number; initial: ThreadDetail; world: WorldConfig; devFakeWorld: boolean };

export default function ThreadView({ groupId, memberId, initial, world, devFakeWorld }: Props) {
  const router = useRouter();
  const [thread, setThread] = useState(initial);
  const { t } = useT();
  const [quote, setQuote] = useState<Post | null>(null);
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
    if (kind === "t") void api("/api/posts", { kind, id }, "DELETE").then(() => router.push(`/groups/${groupId}`)).catch((e) => setError(errMsg(e)));
    else void act(() => api("/api/posts", { kind, id }, "DELETE"));
  };
  const reply = (p: Post) => {
    setQuote(p);
    composer.current?.focus();
  };

  return (
    <div className="stack">
      <article className="card post op">
        <h1 className="flush">{thread.title}</h1>
        <PostBody post={thread.post} />
        {thread.poll && <PollBox poll={thread.poll} memberId={memberId} world={world} devFakeWorld={devFakeWorld} onVoted={refresh} onError={setError} />}
        <PostActions post={thread.post} onReact={(e) => react("t", thread.id, e)} onDelete={() => del("t", thread.id)} />
      </article>

      <h2>{t("返信", "Replies")} ({thread.replies.filter((r) => !r.deleted).length})</h2>
      {thread.replies.length === 0 && <p className="muted small">{t("まだ返信はありません", "No replies yet.")}</p>}
      <ol className="replies">
        {thread.replies.map((r, i) => (
          <li key={r.id} id={`r${r.id}`} className={`card post${r.deleted ? " deleted" : ""}`}>
            {r.quote && (
              <a className="quote small" href={`#r${r.quote.id}`}>
                <strong>{r.quote.author}</strong>: {r.quote.deleted ? t("（削除されました）", "(deleted)") : r.quote.excerpt}
              </a>
            )}
            <PostBody post={r} floor={i + 1} />
            {!r.deleted && (
              <PostActions post={r} onReact={(e) => react("r", r.id, e)} onDelete={() => del("r", r.id)} onReply={() => reply(r)} />
            )}
          </li>
        ))}
      </ol>

      <ReplyForm
        threadId={thread.id}
        quote={quote}
        clearQuote={() => setQuote(null)}
        textarea={composer}
        onPosted={refresh}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PostBody({ post, floor }: { post: Post; floor?: number }) {
  const { lang, t } = useT();
  return (
    <>
      <div className="small muted">
        {floor && <span className="floor">#{floor} · </span>}
        <span className="pseudo">{post.author}</span>
        {post.mine && ` (${t("あなた", "you")})`} · <time title={fmtTime(post.created_at, lang)}>{fmtAgo(post.created_at, lang)}</time>
      </div>
      {post.deleted ? (
        <p className="body">{t("（削除されました）", "(deleted)")}</p>
      ) : (
        post.body && <p className="body">{post.body}</p>
      )}
    </>
  );
}

function PostActions({ post, onReact, onDelete, onReply }: { post: Post; onReact: (e: string) => void; onDelete: () => void; onReply?: () => void }) {
  const { t } = useT();
  const counts = new Map(post.reactions.map((r) => [r.emoji as string, r]));
  return (
    <div className="actions row">
      {REACTIONS.map((e) => {
        const r = counts.get(e);
        return (
          <button key={e} type="button" className={`react${r?.mine ? " on" : ""}`} onClick={() => onReact(e)} aria-pressed={!!r?.mine}>
            {e} {r ? r.count : ""}
          </button>
        );
      })}
      <span className="spacer" />
      {onReply && <button type="button" className="link small" onClick={onReply}>{t("↩ 引用して返信", "↩ Quote")}</button>}
      {post.mine && <button type="button" className="link small danger" onClick={onDelete}>{t("削除", "Delete")}</button>}
    </div>
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

function ReplyForm({ threadId, quote, clearQuote, textarea, onPosted }: {
  threadId: number;
  quote: Post | null;
  clearQuote: () => void;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  onPosted: () => Promise<void>;
}) {
  const { t } = useT();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/threads/${threadId}/replies`, { body, quoteId: quote?.id });
      setBody("");
      clearQuote();
      await onPosted();
      requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack composer" onSubmit={submit}>
      {quote && (
        <div className="quote small row">
          <span style={{ flex: 1 }}><strong>{quote.author}</strong>: {quote.body.slice(0, 100)}</span>
          <button type="button" className="icon" aria-label="cancel quote" onClick={clearQuote}>×</button>
        </div>
      )}
      <textarea
        ref={textarea}
        placeholder={t("返信を書く", "Write a reply")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
        }}
        maxLength={10000}
        rows={3}
        required
      />
      <div className="row">
        <button type="submit" disabled={busy || !body.trim()}>{busy ? "…" : t("返信", "Reply")}</button>
        <span className="small muted">⌘/Ctrl + Enter</span>
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}
