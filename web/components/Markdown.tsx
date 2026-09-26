// A small Markdown subset rendered straight to React elements: no raw HTML ever reaches the
// page. Blocks: paragraphs, line breaks, > quotes, - / 1. lists, ``` code, # headings.
// Inline: **bold**, *italic* / _italic_, ~~strike~~, `code`, [text](https://…), bare URLs.
import { Fragment, type ReactNode } from "react";

const SAFE_URL = /^https?:\/\/[^\s<>"]+$/i;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*)|(\b_[^_\s][^_\n]*?_\b)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>"')\]]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}.${n++}`;
    const [tok] = m;
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<del key={k}>{inline(tok.slice(2, -2), k)}</del>);
    else if (m[4] || m[5]) out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    else if (m[6] && SAFE_URL.test(m[7])) {
      const label = tok.slice(1, tok.indexOf("]("));
      out.push(<a key={k} href={m[7]} target="_blank" rel="noopener noreferrer nofollow ugc">{inline(label, k)}</a>);
    } else if (m[8] && SAFE_URL.test(m[8])) {
      out.push(<a key={k} href={m[8]} target="_blank" rel="noopener noreferrer nofollow ugc">{m[8]}</a>);
    } else out.push(tok);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Lines of one paragraph, joined with line breaks. */
const para = (lines: string[], k: string) =>
  lines.map((l, i) => (
    <Fragment key={`${k}.${i}`}>
      {i > 0 && <br />}
      {inline(l, `${k}.${i}`)}
    </Fragment>
  ));

function blocks(src: string, key = "b"): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `${key}.${n++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(<pre key={k}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={k}>{blocks(q.join("\n"), k)}</blockquote>);
      continue;
    }
    const ul = /^\s*[-*+]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${k}.${j}`)}</li>);
      out.push(ordered ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      out.push(<p key={k} className={`md-h md-h${h[1].length}`}>{inline(h[2], k)}</p>);
      i++;
      continue;
    }
    const p: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^\s*(>|```|[-*+]\s|\d+[.)]\s|#{1,3}\s)/.test(lines[i])
    ) p.push(lines[i++]);
    out.push(<p key={k}>{para(p, k)}</p>);
  }
  return out;
}

export default function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={`md${className ? ` ${className}` : ""}`}>{blocks(text)}</div>;
}
