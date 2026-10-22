"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ログイン中にパスワードを変える（忘れた時の手順は README の「パスワードを忘れた時」）
export function PasswordSettings() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg("8文字以上にしてね");
    if (password !== again) return setMsg("2つのパスワードが同じになっていないみたい");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg("変えられませんでした。一度ログインし直してから、もう一度ためしてね。");
    setPassword("");
    setAgain("");
    setMsg("パスワードを変えたよ。iPhone に保存しているパスワードも更新してね");
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-nasu-700">パスワード</h2>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">新しいパスワード（8文字以上）</label>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">もう一度</label>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </div>
        <button className="btn-soft w-full" disabled={busy || !password}>
          パスワードを変える
        </button>
        {msg && <p className="text-center text-sm text-nasu-600">{msg}</p>}
      </form>
    </section>
  );
}
