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
};

export type Reaction = { emoji: Emoji; count: number; mine: boolean };

export type Post = {
  id: number;
  author: string;
  body: string;
  created_at: number;
  deleted: boolean;
  mine: boolean;
  quote: { id: number; author: string; excerpt: string } | null;
  reactions: Reaction[];
};

export type Poll = { id: number; options: { id: number; label: string; votes: number }[]; total: number };

export type ThreadDetail = {
  id: number;
  group_id: string;
  title: string;
  post: Post;
  replies: Post[];
  poll: Poll | null;
};

