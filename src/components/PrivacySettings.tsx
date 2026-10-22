"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "./ProfileProvider";
import { loadDictionary, saveDictionary } from "@/lib/guard/dictionary";
import type { GuardDictionary } from "@/lib/guard/text";

export function AiCoachSettings() {
  const { profile, reload } = useProfile();
  const [busy, setBusy] = useState(false);

  async function turnOff() {
    if (!confirm("AIコーチをオフにしますか？記録の機能はそのまま使えます。")) return;
    setBusy(true);
    await createClient()
      .from("profiles")
      .update({ consent_ai: false, consent_decided_at: new Date().toISOString() })
      .eq("id", profile.id);
    await reload();
    setBusy(false);
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-nasu-700">AIコーチ</h2>
      <p className="text-sm">
        いまは <b>{profile.consent_ai ? "オン" : "オフ"}</b> です。
      </p>
      {profile.consent_ai ? (
        <button className="btn w-full border border-nasu-200 text-nasu-600" onClick={turnOff} disabled={busy}>
          AIコーチをオフにする
        </button>
      ) : (
        <Link href="/consent" className="btn-soft w-full">
          説明を読んでオンにする
        </Link>
      )}
    </section>
  );
}

// 本名・パートナーの名前・伏せたい言葉（この端末の中にだけ保存）
export function PrivacyGuardSettings() {
  const [dict, setDict] = useState<GuardDictionary>({ realName: "", partnerName: "", words: [] });
  const [word, setWord] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setDict(loadDictionary());
  }, []);

  function update(next: GuardDictionary, msg = "この端末に保存したよ") {
    setDict(next);
    setSaved(saveDictionary(next) ? msg : "保存できませんでした（プライベートブラウズでは保存できません）");
    setTimeout(() => setSaved(null), 2000);
  }

  function addWord(e: React.FormEvent) {
    e.preventDefault();
    const w = word.trim();
    if (!w || dict.words.includes(w)) return;
    setWord("");
    update({ ...dict, words: [...dict.words, w] });
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-bold text-nasu-700">送信前チェック</h2>
        <p className="mt-1 text-xs text-nasu-500">
          ここに入れた言葉は、AIに送る前に「＊＊＊」に置き換えます。<b>この端末の中にだけ保存</b>し、サーバーにもAIにも送りません。
          iPhone のホーム画面アプリと Safari では別々に保存されるので、使う方で登録してね。
        </p>
      </div>
      <div>
        <label className="label">本名</label>
        <input
          className="input"
          autoComplete="off"
          value={dict.realName}
          onChange={(e) => setDict({ ...dict, realName: e.target.value })}
          onBlur={() => update(dict)}
        />
      </div>
      <div>
        <label className="label">パートナーの名前</label>
        <input
          className="input"
          autoComplete="off"
          value={dict.partnerName}
          onChange={(e) => setDict({ ...dict, partnerName: e.target.value })}
          onBlur={() => update(dict)}
        />
      </div>
      <div>
        <label className="label">伏せたい言葉（勤務先・学校・友達の名前など）</label>
        <form onSubmit={addWord} className="flex gap-2">
          <input className="input py-2" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
          <button className="btn-soft shrink-0 px-3 py-2">追加</button>
        </form>
        {dict.words.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {dict.words.map((w) => (
              <li key={w} className="flex items-center gap-1 rounded-full bg-nasu-50 py-1 pl-3 pr-1 text-sm">
                {w}
                <button
                  aria-label={`${w} を消す`}
                  className="px-2 text-nasu-400"
                  onClick={() => update({ ...dict, words: dict.words.filter((x) => x !== w) }, "消したよ")}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {saved && <p className="text-center text-sm text-leaf-600">{saved}</p>}

      <details className="rounded-xl bg-nasu-50 p-3 text-xs leading-relaxed text-nasu-700">
        <summary className="cursor-pointer font-semibold">チェックの内容と限界</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>電話番号・メールアドレス・郵便番号・住所・カード番号やマイナンバーのような数字は、送れません。</li>
          <li>URL や「@〜」のアカウント名は、送ってよいか確認します。</li>
          <li>写真は、人の顔や体が写っていると送れません。料理だけを切り抜けば送れます。</li>
          <li>
            自動チェックは完璧ではありません。横顔・手書きの名前・ここに登録していない名前などは見逃すことがあります。
            逆に、料理を人と間違えて止めることもあります（その時は切り抜き直してね）。
          </li>
          <li>写真の中の文字（レシート・名札など）はまだチェックしていません。写らないように切り抜いてね。</li>
          <li>体重・生理周期・体調・気持ちの相談は、コーチに必要なのでチェックの対象外です。</li>
        </ul>
      </details>
    </section>
  );
}
