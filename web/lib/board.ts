import { getDb } from "./db";

import {
  type Emoji,
  type Poll,
  type Reaction,
  type ThreadDetail,
  type ThreadSummary,
  plainExcerpt,
  REACTIONS,
} from "./board-shared";

export * from "./board-shared";

export async function listThreads(groupId: string, memberId: number): Promise<ThreadSummary[]> {
  const db = await getDb();
  const rows = db.all<Omit<ThreadSummary, "participants" | "last_poster" | "unseen" | "excerpt"> & {
    body: string; read_at: number | null;
  }>(
    `SELECT t.id, t.title, t.body, m.handle AS author, t.created_at,
            COUNT(r.id) AS reply_count, MAX(t.created_at, COALESCE(MAX(r.created_at), 0)) AS last_activity,
            EXISTS (SELECT 1 FROM polls p WHERE p.thread_id = t.id) AS has_poll,
            t.member_id = ? AS mine,
            (SELECT COUNT(*) FROM reactions x WHERE x.kind = 't' AND x.post_id = t.id) AS likes,
            (SELECT read_at FROM thread_reads tr WHERE tr.thread_id = t.id AND tr.member_id = ?) AS read_at,
            SUM(CASE WHEN r.member_id != ? AND r.created_at > COALESCE(
                  (SELECT read_at FROM thread_reads tr WHERE tr.thread_id = t.id AND tr.member_id = ?), 0)
                THEN 1 ELSE 0 END) AS new_replies
       FROM threads t JOIN members m ON m.id = t.member_id
       LEFT JOIN replies r ON r.thread_id = t.id AND r.deleted_at IS NULL
      WHERE t.group_id = ? AND t.deleted_at IS NULL
      GROUP BY t.id
      ORDER BY last_activity DESC`,
    [memberId, memberId, memberId, memberId, groupId],
  );
  return rows.map(({ body, read_at, ...t }) => {
    const repliers = db.all<{ handle: string }>(
      `SELECT m.handle FROM replies r JOIN members m ON m.id = r.member_id
        WHERE r.thread_id = ? AND r.deleted_at IS NULL
        GROUP BY m.id ORDER BY MAX(r.created_at) DESC LIMIT 5`,
      [t.id],
    ).map((x) => x.handle);
    const participants = [t.author, ...repliers.filter((h) => h !== t.author)].slice(0, 5);
    const unseen = !t.mine && read_at === null;
    return {
      ...t,
      excerpt: plainExcerpt(body),
      participants,
      last_poster: repliers[0] ?? t.author,
      unseen,
      // Before the first visit everything is new; show "new topic" rather than a reply count.
      new_replies: unseen ? 0 : t.new_replies,
    };
  });
}

/** Records that the member opened the thread now; returns when they had last opened it. */
export async function markRead(threadId: number, memberId: number): Promise<number | null> {
  const db = await getDb();
  const prev = db.get<{ read_at: number }>(
    "SELECT read_at FROM thread_reads WHERE thread_id = ? AND member_id = ?", [threadId, memberId])?.read_at ?? null;
  db.run(
    `INSERT INTO thread_reads (thread_id, member_id, read_at) VALUES (?, ?, ?)
       ON CONFLICT (thread_id, member_id) DO UPDATE SET read_at = excluded.read_at`,
    [threadId, memberId, Date.now()],
  );
  return prev;
}

/** Raw thread row, for access checks. */
export async function getThread(id: number) {
  if (!Number.isInteger(id)) return undefined;
  const db = await getDb();
  return db.get<{ id: number; group_id: string; member_id: number; deleted_at: number | null }>(
    "SELECT id, group_id, member_id, deleted_at FROM threads WHERE id = ?",
    [id],
  );
}

export async function getReply(id: number) {
  if (!Number.isInteger(id)) return undefined;
  const db = await getDb();
  return db.get<{ id: number; thread_id: number; member_id: number; group_id: string; deleted_at: number | null }>(
    "SELECT r.id, r.thread_id, r.member_id, t.group_id, r.deleted_at FROM replies r JOIN threads t ON t.id = r.thread_id WHERE r.id = ?",
    [id],
  );
}

async function reactionsFor(kind: "t" | "r", ids: number[], memberId: number): Promise<Map<number, Reaction[]>> {
  const out = new Map<number, Reaction[]>();
  if (ids.length === 0) return out;
  const db = await getDb();
  const rows = db.all<{ post_id: number; emoji: Emoji; n: number; mine: number }>(
    `SELECT post_id, emoji, COUNT(*) AS n, MAX(member_id = ?) AS mine FROM reactions
      WHERE kind = ? AND post_id IN (${ids.map(() => "?").join(",")}) GROUP BY post_id, emoji`,
    [memberId, kind, ...ids],
  );
  for (const r of rows) {
    const list = out.get(r.post_id) ?? [];
    list.push({ emoji: r.emoji, count: r.n, mine: !!r.mine });
    out.set(r.post_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji));
  return out;
}

export async function getPoll(threadId: number): Promise<Poll | null> {
  const db = await getDb();
  const poll = db.get<{ id: number }>("SELECT id FROM polls WHERE thread_id = ?", [threadId]);
  if (!poll) return null;
  const options = db.all<{ id: number; label: string; votes: number }>(
    `SELECT o.id, o.label, COUNT(v.world_nullifier) AS votes FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
      WHERE o.poll_id = ? GROUP BY o.id ORDER BY o.position`,
    [poll.id],
  );
  return { id: poll.id, options, total: options.reduce((n, o) => n + o.votes, 0) };
}

/** The thread with its posts. With `markAsRead`, also records this visit (see markRead). */
export async function threadDetail(threadId: number, memberId: number, markAsRead = false): Promise<ThreadDetail | undefined> {
  const db = await getDb();
  const t = db.get<{ id: number; group_id: string; title: string; body: string; author: string; created_at: number; member_id: number }>(
    `SELECT t.id, t.group_id, t.title, t.body, m.handle AS author, t.created_at, t.member_id
       FROM threads t JOIN members m ON m.id = t.member_id WHERE t.id = ? AND t.deleted_at IS NULL`,
    [threadId],
  );
  if (!t) return undefined;
  const lastReadAt = markAsRead
    ? await markRead(t.id, memberId)
    : db.get<{ read_at: number }>("SELECT read_at FROM thread_reads WHERE thread_id = ? AND member_id = ?", [t.id, memberId])
        ?.read_at ?? null;
  const rows = db.all<{
    id: number; body: string; author: string; created_at: number; member_id: number; deleted_at: number | null;
    quote_id: number | null; q_author: string | null; q_body: string | null; q_deleted: number | null;
  }>(
    `SELECT r.id, r.body, m.handle AS author, r.created_at, r.member_id, r.deleted_at, r.quote_id,
            qm.handle AS q_author, q.body AS q_body, q.deleted_at AS q_deleted
       FROM replies r JOIN members m ON m.id = r.member_id
       LEFT JOIN replies q ON q.id = r.quote_id
       LEFT JOIN members qm ON qm.id = q.member_id
      WHERE r.thread_id = ? ORDER BY r.created_at ASC, r.id ASC`,
    [threadId],
  );
  const tr = await reactionsFor("t", [t.id], memberId);
  const rr = await reactionsFor("r", rows.map((r) => r.id), memberId);
  return {
    id: t.id,
    group_id: t.group_id,
    title: t.title,
    last_read_at: lastReadAt,
    post: {
      id: t.id, author: t.author, body: t.body, created_at: t.created_at, deleted: false,
      mine: t.member_id === memberId, quote: null, reactions: tr.get(t.id) ?? [],
    },
    replies: rows.map((r) => ({
      id: r.id,
      author: r.author,
      body: r.deleted_at ? "" : r.body,
      created_at: r.created_at,
      deleted: !!r.deleted_at,
      mine: r.member_id === memberId,
      quote: r.quote_id && r.q_author
        ? { id: r.quote_id, author: r.q_author, excerpt: r.q_deleted ? "" : plainExcerpt(r.q_body ?? "", 120), deleted: !!r.q_deleted }
        : null,
      reactions: r.deleted_at ? [] : rr.get(r.id) ?? [],
    })),
    poll: await getPoll(t.id),
  };
}
