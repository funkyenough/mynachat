import { getDb } from "./db";

export type Thread = {
  id: number;
  group_id: string;
  title: string;
  body: string;
  author: string;
  created_at: number;
  reply_count: number;
  last_activity: number;
};

export type Reply = { id: number; body: string; author: string; created_at: number };

export async function listThreads(groupId: string): Promise<Thread[]> {
  const db = await getDb();
  return db.all<Thread>(
    `SELECT t.id, t.group_id, t.title, t.body, m.pseudonym AS author, t.created_at,
            COUNT(r.id) AS reply_count, MAX(t.created_at, COALESCE(MAX(r.created_at), 0)) AS last_activity
       FROM threads t JOIN members m ON m.id = t.member_id
       LEFT JOIN replies r ON r.thread_id = t.id
      WHERE t.group_id = ?
      GROUP BY t.id
      ORDER BY last_activity DESC`,
    [groupId],
  );
}

export async function getThread(id: number): Promise<Thread | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const db = await getDb();
  return db.get<Thread>(
    `SELECT t.id, t.group_id, t.title, t.body, m.pseudonym AS author, t.created_at,
            0 AS reply_count, t.created_at AS last_activity
       FROM threads t JOIN members m ON m.id = t.member_id WHERE t.id = ?`,
    [id],
  );
}

export async function listReplies(threadId: number): Promise<Reply[]> {
  const db = await getDb();
  return db.all<Reply>(
    `SELECT r.id, r.body, m.pseudonym AS author, r.created_at
       FROM replies r JOIN members m ON m.id = r.member_id
      WHERE r.thread_id = ? ORDER BY r.created_at ASC`,
    [threadId],
  );
}
