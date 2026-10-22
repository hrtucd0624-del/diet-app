"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { AiPhotoPicker, type PickedPhoto } from "@/components/AiPhotoPicker";
import { useTextGuard } from "@/components/useTextGuard";
import { callCoach } from "@/lib/coach";

type Message = {
  id: number | string;
  role: "user" | "coach" | "notice";
  text: string;
  photo_path?: string | null;
  url?: string;
};

const QUICK = [
  { label: "これ食べていい？", text: "これ食べていい？ " },
  { label: "食べすぎちゃった", text: "食べすぎちゃった。" },
  { label: "お腹すいた", text: "お腹すいた" },
  { label: "朝の報告", text: "おはよう。朝の報告です。" },
  { label: "夜の振り返り", text: "今日の振り返りをしたい" },
];

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const { profile } = useProfile();
  const params = useSearchParams();
  const supabase = createClient();
  const { guard, modal } = useTextGuard();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(params.get("topic") === "before" ? "これ食べていい？ " : "");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, text, photo_path")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = ((data as Message[]) ?? []).reverse();
    const paths = rows.map((m) => m.photo_path).filter((p): p is string => !!p);
    const urls: Record<string, string> = {};
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("meal-photos").createSignedUrls(paths, 3600);
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
      });
    }
    setMessages(rows.map((m) => ({ ...m, url: m.photo_path ? urls[m.photo_path] : undefined })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile.consent_ai) load();
  }, [load, profile.consent_ai]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function picked(p: PickedPhoto) {
    if (!p.aiOk) {
      URL.revokeObjectURL(p.url);
      setPhoto(null);
      setPhotoNote(`この写真はAIに送れません（${p.reasons.join("・")}が写っているみたい）。料理だけを切り抜き直してね。`);
      return;
    }
    setPhotoNote(null);
    setPhoto(p);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (thinking) return;
    const raw = text.trim();
    if (!raw && !photo) return;

    // 送信前チェック（端末の中だけで調べる）
    const safe = raw ? await guard(raw) : "";
    if (safe === null) return;

    setThinking(true);
    let photo_path: string | null = null;
    if (photo) {
      const path = `${profile.id}/chat/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("meal-photos").upload(path, photo.blob, { contentType: "image/jpeg" });
      if (error) {
        setThinking(false);
        setMessages((m) => [...m, { id: `n${Date.now()}`, role: "notice", text: "写真を送れませんでした。電波を確認してもう一度ためしてね。" }]);
        return;
      }
      photo_path = path;
    }

    // 先にメッセージを保存する（AIが混んでいても消えないように）
    const { data: saved, error } = await supabase
      .from("chat_messages")
      .insert({ role: "user", text: safe || "（写真）", photo_path })
      .select("id")
      .single();
    if (error) {
      setThinking(false);
      setMessages((m) => [...m, { id: `n${Date.now()}`, role: "notice", text: "送れませんでした。電波を確認してもう一度ためしてね。" }]);
      return;
    }
    setMessages((m) => [...m, { id: saved.id, role: "user", text: safe || "（写真）", photo_path, url: photo?.url }]);
    setText("");
    setPhoto(null);

    const res = await callCoach<{ reply: string }>("reply");
    setThinking(false);
    if (res.ok) {
      setMessages((m) => [...m, { id: `c${Date.now()}`, role: "coach", text: res.data.reply }]);
    } else {
      setMessages((m) => [...m, { id: `n${Date.now()}`, role: "notice", text: res.message }]);
    }
  }

  async function retry() {
    setThinking(true);
    const res = await callCoach<{ reply: string }>("reply");
    setThinking(false);
    setMessages((m) => [
      ...m,
      res.ok ? { id: `c${Date.now()}`, role: "coach", text: res.data.reply } : { id: `n${Date.now()}`, role: "notice", text: res.message },
    ]);
  }

  if (!profile.consent_ai) {
    return (
      <div className="space-y-4 pt-6">
        <h1 className="text-xl font-bold text-nasu-700">コーチに相談</h1>
        <div className="card text-sm leading-relaxed">
          AIコーチは今オフになっています。使うには、AIに送る内容についての説明を読んで、同意してね。
        </div>
        <Link href="/consent" className="btn-primary w-full">
          説明を読む
        </Link>
      </div>
    );
  }

  const last = messages[messages.length - 1];

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col pt-6">
      <h1 className="mb-3 text-xl font-bold text-nasu-700">コーチに相談</h1>

      <div className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <p className="card text-sm text-nasu-600">
            {profile.nickname}さん、なんでも相談してね。食べる前・食べたあと・お腹がすいた時、いつでもどうぞ。
          </p>
        )}
        {messages.map((m) =>
          m.role === "notice" ? (
            <p key={m.id} className="rounded-xl bg-sun-100 p-3 text-sm">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  m.role === "user" ? "rounded-br-sm bg-nasu-500 text-white" : "rounded-bl-sm bg-white ring-1 ring-nasu-100"
                }`}
              >
                {m.url && <img src={m.url} alt="" className="mb-2 max-h-56 rounded-xl" />}
                {m.text}
              </div>
            </div>
          ),
        )}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm text-nasu-500 ring-1 ring-nasu-100">考え中…</div>
          </div>
        )}
        {!thinking && last?.role === "notice" && messages.some((m) => m.role === "user") && (
          <button className="text-sm text-nasu-600 underline" onClick={retry}>
            もう一度返事をもらう
          </button>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-20 space-y-2 bg-[var(--background)] pb-2 pt-1">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              className="shrink-0 rounded-full bg-nasu-100 px-3 py-1.5 text-sm text-nasu-700"
              onClick={() => setText(q.text)}
            >
              {q.label}
            </button>
          ))}
        </div>
        {photo && (
          <div className="flex items-center gap-2">
            <img src={photo.url} alt="送る写真" className="h-14 w-14 rounded-lg object-cover" />
            <button className="text-sm text-nasu-500 underline" onClick={() => setPhoto(null)}>
              写真をやめる
            </button>
          </div>
        )}
        {photoNote && <p className="rounded-xl bg-sun-100 p-2 text-xs">{photoNote}</p>}
        <form onSubmit={send} className="flex items-end gap-2">
          <AiPhotoPicker onPicked={picked} className="btn-soft shrink-0 cursor-pointer px-3">
            📷
          </AiPhotoPicker>
          <textarea
            rows={1}
            className="input max-h-32 min-h-12 resize-none py-2.5"
            placeholder="メッセージ"
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary shrink-0 px-4" disabled={thinking || (!text.trim() && !photo)}>
            送る
          </button>
        </form>
        <p className="text-[11px] text-nasu-400">送る前に、名前や電話番号などが入っていないか端末の中でチェックしています。</p>
      </div>
      {modal}
    </div>
  );
}
