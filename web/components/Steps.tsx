/** Numbered progress for multi-step flows. */
export type Step = { label: string; state: "done" | "current" | "todo" };

export default function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps-bar">
      {steps.map((s, i) => (
        <li key={i} className={s.state}>
          <span className="num">{s.state === "done" ? "✓" : i + 1}</span>
          <span className="lbl">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
