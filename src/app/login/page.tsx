"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// メール＋パスワードでログインする（メールは送らない）。
// 2人が登録し終わったら、Supabase 側で新規登録を止める
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setMessage("メールアドレスかパスワードが違うみたい。もう一度ためしてね。");
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      if (error) {
        setMessage(
          error.message.toLowerCase().includes("not allowed") || error.message.toLowerCase().includes("disabled")
            ? "いまは新しい登録を受け付けていません。"
            : "登録できませんでした。パスワードは8文字以上にしてね。",
        );
        return;
      }
      if (!data.session) {
        setMessage("登録はできましたが、ログインできませんでした。Supabase の「Confirm email」がオフか確認してね。");
        return;
      }
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <img src="/icons/icon-192.png" alt="" className="mx-auto mb-4 h-20 w-20 rounded-3xl" />
        <h1 className="text-2xl font-bold text-nasu-700">なすびコーチ</h1>
        <p className="mt-2 text-sm text-nasu-600">自分で決めたことを、毎日ちょっとずつ。</p>
      </div>

      <div className="mb-3 flex gap-1 rounded-xl bg-nasu-100 p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMessage(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm ${mode === m ? "bg-white font-bold text-nasu-700 shadow-sm" : "text-nasu-500"}`}
          >
            {m === "login" ? "ログイン" : "はじめて登録"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="email">メールアドレス</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">パスワード{mode === "signup" && "（8文字以上）"}</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "少し待ってね…" : mode === "login" ? "ログイン" : "登録してはじめる"}
        </button>
        {mode === "signup" && (
          <p className="text-xs text-nasu-500">iPhone ならパスワードを自動で作って保存してくれます（キーボードの上の提案をタップ）。</p>
        )}
      </form>

      {message && <p className="mt-4 rounded-xl bg-sun-100 p-3 text-sm">{message}</p>}
    </main>
  );
}
