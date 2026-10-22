"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { TargetWeightInput, isValidTarget, numOrNull } from "@/components/ProfileFields";
import { today } from "@/lib/date";
import { AiCoachSettings, PrivacyGuardSettings } from "@/components/PrivacySettings";
import { NotificationSettings } from "@/components/NotificationSettings";

const RECORD_TABLES = ["weights", "meals", "exercises", "conditions", "cycles", "todos", "chat_messages"] as const;

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, reload } = useProfile();
  const [nickname, setNickname] = useState(profile.nickname);
  const [height, setHeight] = useState(profile.height_cm?.toString() ?? "");
  const [target, setTarget] = useState(profile.target_weight_kg?.toString() ?? "");
  const [notes, setNotes] = useState(profile.body_notes ?? "");
  const [cycleLen, setCycleLen] = useState(profile.cycle_length_days.toString());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidTarget(target) || !nickname.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        nickname: nickname.trim(),
        height_cm: numOrNull(height),
        target_weight_kg: numOrNull(target),
        body_notes: notes.trim() || null,
        cycle_length_days: Math.min(45, Math.max(20, Number(cycleLen) || 28)),
      })
      .eq("id", profile.id);
    setBusy(false);
    setMsg(error ? "保存できませんでした。入力を見なおしてね。" : "保存したよ");
    if (!error) reload();
  }

  async function exportData() {
    setBusy(true);
    const result: Record<string, unknown> = { exported_at: new Date().toISOString(), profile };
    for (const t of RECORD_TABLES) {
      const { data } = await supabase.from(t).select("*");
      result[t] = data ?? [];
    }
    setBusy(false);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nasubi-coach-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteRecords() {
    if (!confirm("記録（体重・食事・運動・体調・生理・やること・コーチとのチャット）と写真をすべて消します。元に戻せません。よろしいですか？")) return;
    if (prompt("確認のため「けす」と入力してください") !== "けす") return;
    setBusy(true);
    // 食事の写真（{id}/）とチャットの写真（{id}/chat/）
    for (const folder of [profile.id, `${profile.id}/chat`]) {
      const { data: files } = await supabase.storage.from("meal-photos").list(folder, { limit: 1000 });
      const paths = (files ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
      if (paths.length) await supabase.storage.from("meal-photos").remove(paths);
    }
    for (const t of RECORD_TABLES) {
      await supabase.from(t).delete().eq("owner_id", profile.id);
    }
    setBusy(false);
    setMsg("記録をすべて消しました");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-xl font-bold text-nasu-700">設定</h1>

      <form onSubmit={save} className="card space-y-3">
        <h2 className="font-bold text-nasu-700">プロフィール</h2>
        <div>
          <label className="label">ニックネーム（本名以外）</label>
          <input className="input" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div>
          <label className="label">身長（cm）</label>
          <input type="number" inputMode="decimal" step="0.1" className="input" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <TargetWeightInput value={target} onChange={setTarget} />
        <div>
          <label className="label">体質メモ</label>
          <textarea className="input min-h-24" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div>
          <label className="label">生理のだいたいの周期（日）</label>
          <input type="number" inputMode="numeric" min={20} max={45} className="input" value={cycleLen} onChange={(e) => setCycleLen(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy || !isValidTarget(target)}>
          保存する
        </button>
        {msg && <p className="text-center text-sm text-leaf-600">{msg}</p>}
      </form>

      <NotificationSettings />
      <AiCoachSettings />
      <PrivacyGuardSettings />

      <section className="card space-y-3">
        <h2 className="font-bold text-nasu-700">データ</h2>
        <button className="btn-soft w-full" onClick={exportData} disabled={busy}>
          記録を書き出す（JSON）
        </button>
        <button className="btn w-full border border-nasu-200 text-nasu-600" onClick={deleteRecords} disabled={busy}>
          記録をすべて消す
        </button>
        <p className="text-xs text-nasu-500">アカウントそのものの削除は、のちのフェーズで追加します。</p>
      </section>

      <button className="btn-soft w-full" onClick={logout}>
        ログアウト
      </button>
    </div>
  );
}
