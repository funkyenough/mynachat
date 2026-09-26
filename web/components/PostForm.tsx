"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** New thread (withTitle) or reply form. Posts JSON to `url`, then refreshes the page. */
export default function PostForm({ url, withTitle }: { url: string; withTitle?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withTitle ? { title, body } : { body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      {withTitle && (
        <input type="text" placeholder="タイトル / Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      )}
      <textarea
        placeholder={withTitle ? "本文 / Body" : "返信 / Reply"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={10000}
        required={!withTitle}
      />
      <div className="row">
        <button type="submit" disabled={busy}>{withTitle ? "スレッドを作成 / Post thread" : "返信 / Reply"}</button>
        {error && <span className="error small">{error}</span>}
      </div>
    </form>
  );
}
