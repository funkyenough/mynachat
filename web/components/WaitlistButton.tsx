"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./LangProvider";
import { api, errMsg } from "@/lib/api";

export default function WaitlistButton({ code, on: initial, count }: { code: string; on: boolean; count: number }) {
  const router = useRouter();
  const { t } = useT();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="row">
      <button
        className={on ? "secondary" : ""}
        onClick={async () => {
          try {
            setOn((await api<{ on: boolean }>("/api/waitlist", { code })).on);
            router.refresh();
          } catch (e) {
            setError(errMsg(e));
          }
        }}
      >
        {on ? t("✓ 登録済み", "✓ Interested") : t("参加を希望する", "I'd join this")}
      </button>
      <span className="small muted">{t(`${count} 人が希望`, `${count} interested`)}</span>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
