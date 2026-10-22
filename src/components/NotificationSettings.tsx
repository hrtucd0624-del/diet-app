"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "./ProfileProvider";
import { currentSubscription, deviceTimeZone, disablePush, enablePush, pushSupported, sendTestPush } from "@/lib/push";
import { isIOS, isStandalone } from "@/lib/pwa";

const DENIED = "通知が許可されていません。iPhone の「設定」→「通知」→「なすびコーチ」でオンにしてね。";

// 通知のオン／オフと時刻。オンにする操作だけは、iPhone の決まりでボタンを押した時にしかできない
export function NotificationToggle({ onEnabled }: { onEnabled?: () => void }) {
  const { profile } = useProfile();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    currentSubscription()
      .then((s) => setOn(!!s))
      .catch(() => setOn(false));
  }, []);

  if (!pushSupported()) {
    return (
      <p className="rounded-xl bg-nasu-50 p-3 text-sm">
        {isIOS() && !isStandalone()
          ? "iPhone では、ホーム画面に追加したアプリから開くと通知をオンにできます。"
          : "このブラウザでは通知が使えません。"}
      </p>
    );
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    const r = await enablePush(profile.id);
    setBusy(false);
    if (r === "ok") {
      setOn(true);
      setMsg("通知をオンにしたよ");
      onEnabled?.();
    } else if (r === "denied") setMsg(DENIED);
    else setMsg("うまくオンにできませんでした。もう一度ためしてね。");
  }

  async function disable() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setOn(false);
    setMsg("この端末の通知をオフにしたよ");
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const ok = await sendTestPush();
    setBusy(false);
    setMsg(ok ? "テスト通知を送ったよ。数秒で届くはず" : "送れませんでした。通知をオフ→オンにしてみてね。");
  }

  return (
    <div className="space-y-2">
      {on ? (
        <div className="flex gap-2">
          <button className="btn-soft flex-1" onClick={test} disabled={busy}>
            テスト通知を送る
          </button>
          <button className="btn flex-1 border border-nasu-200 text-nasu-600" onClick={disable} disabled={busy}>
            オフにする
          </button>
        </div>
      ) : (
        <button className="btn-primary w-full" onClick={enable} disabled={busy || on === null}>
          🔔 この端末で通知をオンにする
        </button>
      )}
      {msg && <p className="rounded-xl bg-nasu-50 p-2 text-center text-sm">{msg}</p>}
    </div>
  );
}

export function NotificationSettings() {
  const { profile, reload } = useProfile();
  const [morning, setMorning] = useState(profile.notify_morning.slice(0, 5));
  const [evening, setEvening] = useState(profile.notify_evening.slice(0, 5));
  const [workEnd, setWorkEnd] = useState(profile.notify_work_end);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient()
      .from("profiles")
      .update({ notify_morning: morning, notify_evening: evening, notify_work_end: workEnd, timezone: deviceTimeZone() })
      .eq("id", profile.id);
    setSaved(error ? "保存できませんでした" : "保存したよ");
    setTimeout(() => setSaved(null), 2000);
    if (!error) reload();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-nasu-700">通知</h2>
      <NotificationToggle />
      <form onSubmit={save} className="space-y-3 border-t border-nasu-50 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">朝のお知らせ</label>
            <input type="time" className="input" value={morning} onChange={(e) => setMorning(e.target.value)} required />
          </div>
          <div>
            <label className="label">夜の振り返り</label>
            <input type="time" className="input" value={evening} onChange={(e) => setEvening(e.target.value)} required />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-nasu-500" checked={workEnd} onChange={(e) => setWorkEnd(e.target.checked)} />
          バイトが終わったらお知らせ（予定に入れたバイト）
        </label>
        <button className="btn-soft w-full">時刻を保存</button>
        {saved && <p className="text-center text-sm text-leaf-600">{saved}</p>}
        <p className="text-xs text-nasu-500">
          iPhone の通知は届かないこともあります。アプリを開いた時は、同じ内容をホームの 🔔 に出します。
        </p>
      </form>
    </section>
  );
}
