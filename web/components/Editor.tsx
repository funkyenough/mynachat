"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { useT } from "./LangProvider";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  required?: boolean;
  /** ⌘/Ctrl + Enter */
  onSubmit?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

type Tool = { label: string; title: [string, string]; wrap?: [string, string]; line?: string };
const TOOLS: Tool[] = [
  { label: "B", title: ["太字", "Bold"], wrap: ["**", "**"] },
  { label: "I", title: ["斜体", "Italic"], wrap: ["*", "*"] },
  { label: "🔗", title: ["リンク", "Link"], wrap: ["[", "](https://)"] },
  { label: "❝", title: ["引用", "Quote"], line: "> " },
  { label: "•", title: ["リスト", "List"], line: "- " },
  { label: "</>", title: ["コード", "Code"], wrap: ["`", "`"] },
];

/** Markdown textarea with a small toolbar and a Write / Preview switch. */
export default function Editor({ value, onChange, placeholder, rows = 5, autoFocus, required, onSubmit, textareaRef }: Props) {
  const { t } = useT();
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? own;
  const [preview, setPreview] = useState(false);
  // Back to writing once the text is cleared (e.g. after posting).
  useEffect(() => {
    if (!value) setPreview(false);
  }, [value]);

  function apply(tool: Tool) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = value.slice(a, b);
    let next: string, cursor: number;
    if (tool.wrap) {
      next = value.slice(0, a) + tool.wrap[0] + sel + tool.wrap[1] + value.slice(b);
      cursor = a + tool.wrap[0].length + sel.length;
    } else {
      const start = value.lastIndexOf("\n", a - 1) + 1;
      next = value.slice(0, start) + tool.line + value.slice(start);
      cursor = b + tool.line!.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="editor">
      <div className="editor-bar">
        <div className="editor-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!preview} className={!preview ? "on" : ""} onClick={() => setPreview(false)}>
            {t("書く", "Write")}
          </button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? "on" : ""} onClick={() => setPreview(true)}>
            {t("プレビュー", "Preview")}
          </button>
        </div>
        {!preview && (
          <div className="editor-tools">
            {TOOLS.map((tool) => (
              <button key={tool.label} type="button" title={t(...tool.title)} aria-label={t(...tool.title)} onClick={() => apply(tool)}>
                {tool.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {preview ? (
        <div className="editor-preview">
          {value.trim() ? <Markdown text={value} /> : <p className="muted small">{t("プレビューする内容がありません", "Nothing to preview")}</p>}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          required={required}
          maxLength={10000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      )}
      <div className="editor-hint small muted">
        {t("Markdown 対応 · ⌘/Ctrl + Enter で送信", "Markdown supported · ⌘/Ctrl + Enter to post")}
      </div>
    </div>
  );
}
