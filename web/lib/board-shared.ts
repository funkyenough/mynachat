// Board types and constants shared by server and client code (no server imports here).
export const REACTIONS = ["👍", "❤️", "🙏", "🤝"] as const;
export type Emoji = (typeof REACTIONS)[number];
export const isEmoji = (v: unknown): v is Emoji => REACTIONS.includes(v as Emoji);

export type ThreadSummary = {
  id: number;
  title: string;
  excerpt: string;
  author: string;
  created_at: number;
  reply_count: number;
  last_activity: number;
  has_poll: number;
  mine: number;
  /** Reactions on the opening post (the topic's "likes"). */
  likes: number;
  /** Handles of the author and the most recent repliers, author first (max 5). */
  participants: string[];
  /** Handle of whoever posted last (the author if there are no replies). */
  last_poster: string;
  /** Never opened by this member (and not theirs). */
  unseen: boolean;
  /** Replies by others since this member last opened the topic. */
  new_replies: number;
};

export type Reaction = { emoji: Emoji; count: number; mine: boolean };

export type Post = {
  id: number;
  author: string;
  body: string;
  created_at: number;
  deleted: boolean;
  mine: boolean;
  quote: { id: number; author: string; excerpt: string; deleted: boolean } | null;
  reactions: Reaction[];
};

export type Poll = { id: number; options: { id: number; label: string; votes: number }[]; total: number };

export type ThreadDetail = {
  id: number;
  group_id: string;
  title: string;
  /** When this member had last opened the topic before now (null: first visit). */
  last_read_at: number | null;
  post: Post;
  replies: Post[];
  poll: Poll | null;
};


/** Plain-text preview of Markdown source, for topic list excerpts. */
export function plainExcerpt(md: string, n = 160): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~]+/g, "")
    .replace(/^\s*([-+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > n ? `${text.slice(0, n)}…` : text;
}
