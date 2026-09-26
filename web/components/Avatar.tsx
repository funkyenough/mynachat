/** Initials on a colour derived from the handle: stable per person, no uploads needed. */
export default function Avatar({ handle, size = 36 }: { handle: string; size?: number }) {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.codePointAt(0)!) % 360;
  const parts = handle.split(/[-_.\s]+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : [...handle].slice(0, 2).join("")).toUpperCase();
  return (
    <span
      className="avatar"
      title={handle}
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 42% 42%)` }}
    >
      {initials}
    </span>
  );
}
