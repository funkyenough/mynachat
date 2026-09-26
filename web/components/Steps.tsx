/** Numbered progress for multi-step flows. Labels are "日本語 / English". */
export type Step = { label: string; state: "done" | "current" | "todo" };

export default function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps-bar">
      {steps.map((s, i) => {
        const [ja, en] = s.label.split(" / ");
        return (
          <li key={i} className={s.state}>
            <span className="num">{s.state === "done" ? "✓" : i + 1}</span>
            <span className="lbl">
              {ja}
              {en && <span className="en">{en}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
