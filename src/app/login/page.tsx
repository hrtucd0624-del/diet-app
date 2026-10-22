"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// iPhone のホーム画面アプリは Safari とログイン状態が別になるため、
// メールのリンクではなく「メールに届く数字のコード」を入力する方式を基本にする
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (error) {
      setMessage("うまく送れませんでした。少し待ってからもう一度ためしてね。");
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setMessage("コードが合わないみたい。最新のメールのコードをもう一度入れてね。");
      return;
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

      {step === "email" ? (
        <form onSubmit={sendCode} className="card space-y-4">
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
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "送っています…" : "ログイン用のコードを送る"}
          </button>
          <p className="text-xs text-nasu-600">パスワードは不要です。メールに届くコードでログインします。</p>
        </form>
      ) : (
        <form onSubmit={verify} className="card space-y-4">
          <p className="text-sm">
            <span className="font-semibold">{email}</span> にコードを送りました。
          </p>
          <div>
            <label className="label" htmlFor="code">メールに届いたコード</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              className="input text-center text-2xl tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "確認しています…" : "ログイン"}
          </button>
          <button type="button" className="w-full text-sm text-nasu-600 underline" onClick={() => setStep("email")}>
            メールアドレスを入れなおす
          </button>
        </form>
      )}

      {message && <p className="mt-4 rounded-xl bg-sun-100 p-3 text-sm">{message}</p>}
    </main>
  );
}
