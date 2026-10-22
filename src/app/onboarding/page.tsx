"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { AddToHomeGuide } from "@/components/AddToHomeGuide";
import { TargetWeightInput, isValidTarget, numOrNull } from "@/components/ProfileFields";
import { isStandalone } from "@/lib/pwa";

// フェーズ1の初回設定。同意画面はフェーズ2、通知の許可はフェーズ3で追加する
const STEPS = ["welcome", "nickname", "body", "notes", "cycle", "home"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { profile, reload } = useProfile();
  const [i, setI] = useState(0);
  const [nickname, setNickname] = useState(profile.nickname || "なすび");
  const [height, setHeight] = useState(profile.height_cm?.toString() ?? "");
  const [target, setTarget] = useState(profile.target_weight_kg?.toString() ?? "");
  const [notes, setNotes] = useState(profile.body_notes ?? "");
  const [lastStart, setLastStart] = useState("");
  const [cycleLen, setCycleLen] = useState(profile.cycle_length_days.toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[i];
  const next = () => setI((n) => Math.min(n + 1, STEPS.length - 1));
  const back = () => setI((n) => Math.max(n - 1, 0));

  const canNext =
    (step !== "nickname" || nickname.trim().length > 0) && (step !== "body" || isValidTarget(target));

  async function finish() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const len = Math.min(45, Math.max(20, Number(cycleLen) || 28));
    const { error: e1 } = await supabase
      .from("profiles")
      .update({
        nickname: nickname.trim(),
        height_cm: numOrNull(height),
        target_weight_kg: numOrNull(target),
        body_notes: notes.trim() || null,
        cycle_length_days: len,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    if (!e1 && lastStart) {
      await supabase.from("cycles").upsert({ start_date: lastStart }, { onConflict: "owner_id,start_date" });
    }
    setBusy(false);
    if (e1) {
      setError("保存できませんでした。入力を見なおして、もう一度ためしてね。");
      return;
    }
    await reload();
    router.replace("/");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex gap-1">
        {STEPS.map((s, n) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${n <= i ? "bg-nasu-400" : "bg-nasu-100"}`} />
        ))}
      </div>

      <div className="flex-1 space-y-5">
        {step === "welcome" && (
          <>
            <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-3xl" />
            <h1 className="text-2xl font-bold text-nasu-700">はじめまして</h1>
            <p className="leading-relaxed">
              このアプリは、あなたが<b>自分で決めたこと</b>を毎日続けるための場所です。
              うまくいかない日があっても大丈夫。また戻ってくれば、それで続いています。
            </p>
          </>
        )}

        {step === "nickname" && (
          <>
            <h1 className="text-xl font-bold text-nasu-700">なんて呼べばいい？</h1>
            <p className="text-sm text-nasu-600">
              本名ではなく、ニックネームにしてね。コーチは「{nickname || "なすび"}さん」と呼びます。
            </p>
            <input className="input" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </>
        )}

        {step === "body" && (
          <>
            <h1 className="text-xl font-bold text-nasu-700">からだのこと</h1>
            <div>
              <label className="label" htmlFor="height">身長（cm）</label>
              <input
                id="height"
                type="number"
                inputMode="decimal"
                step="0.1"
                className="input"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
            <TargetWeightInput value={target} onChange={setTarget} />
          </>
        )}

        {step === "notes" && (
          <>
            <h1 className="text-xl font-bold text-nasu-700">体質メモ</h1>
            <p className="text-sm text-nasu-600">
              コーチに知っておいてほしいこと。例：お腹がゆるくなりやすい、甘いものは夜に欲しくなる、など。
            </p>
            <textarea
              className="input min-h-32"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </>
        )}

        {step === "cycle" && (
          <>
            <h1 className="text-xl font-bold text-nasu-700">生理の周期</h1>
            <p className="text-sm text-nasu-600">
              時期によって体重や食欲が変わるので、コーチが参考にします。分からなければ空のままでOK。
            </p>
            <div>
              <label className="label" htmlFor="last">前回の生理が始まった日</label>
              <input id="last" type="date" className="input" value={lastStart} onChange={(e) => setLastStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="len">だいたいの周期（日）</label>
              <input
                id="len"
                type="number"
                inputMode="numeric"
                min={20}
                max={45}
                className="input"
                value={cycleLen}
                onChange={(e) => setCycleLen(e.target.value)}
              />
            </div>
          </>
        )}

        {step === "home" && (
          <>
            <h1 className="text-xl font-bold text-nasu-700">ホーム画面に追加しよう</h1>
            {isStandalone() ? (
              <p>もうホーム画面から開いているね。このまま始めよう。</p>
            ) : (
              <>
                <p className="text-sm text-nasu-600">
                  iPhone では、ホーム画面に追加すると通知が届くようになります。
                </p>
                <div className="card">
                  <AddToHomeGuide />
                </div>
                <p className="text-xs text-nasu-500">
                  追加したら、ホーム画面のアイコンから開いて、もう一度ログインしてね（Safari とは別あつかいのため）。
                </p>
              </>
            )}
          </>
        )}

        {error && <p className="rounded-xl bg-sun-100 p-3 text-sm">{error}</p>}
      </div>

      <div className="mt-8 flex gap-3">
        {i > 0 && (
          <button className="btn-soft flex-1" onClick={back} disabled={busy}>
            もどる
          </button>
        )}
        {step === "home" ? (
          <button className="btn-primary flex-[2]" onClick={finish} disabled={busy}>
            {busy ? "保存しています…" : "はじめる"}
          </button>
        ) : (
          <button className="btn-primary flex-[2]" onClick={next} disabled={!canNext}>
            つぎへ
          </button>
        )}
      </div>
    </div>
  );
}
