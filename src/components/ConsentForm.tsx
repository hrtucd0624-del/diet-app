"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "./ProfileProvider";

// AIコーチの同意。同意しなくても記録の機能はすべて使える
export function ConsentForm({ onDone }: { onDone: () => void }) {
  const { profile, reload } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(consent: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await createClient()
      .from("profiles")
      .update({ consent_ai: consent, consent_decided_at: new Date().toISOString() })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return setError("保存できませんでした。もう一度ためしてね。");
    await reload();
    onDone();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-nasu-700">AIコーチを使う前に</h1>
      <div className="card space-y-3 text-sm leading-relaxed">
        <p>
          AIコーチは、Google の <b>Gemini（無料枠）</b> で動いています。
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            コーチに送った内容（チャット・今日の記録・料理の写真）は、<b>Google の製品改善に使われ、人が読む可能性があります。</b>
          </li>
          <li>
            そのため、<b>本名・顔の写真は送らない仕組み</b>になっています。コーチにはニックネームだけを渡し、送る前に端末の中で名前や電話番号・住所などをチェックします。
          </li>
          <li>
            体重・生理周期・体調・気持ちの相談は、コーチに必要なので送ります。
          </li>
          <li>同意しなくても、記録やグラフなどの機能はすべて使えます。あとから設定で変えられます。</li>
        </ul>
      </div>
      {error && <p className="rounded-xl bg-sun-100 p-3 text-sm">{error}</p>}
      <button className="btn-primary w-full" disabled={busy} onClick={() => decide(true)}>
        分かった。AIコーチを使う
      </button>
      <button className="btn-soft w-full" disabled={busy} onClick={() => decide(false)}>
        今は使わない
      </button>
    </div>
  );
}
