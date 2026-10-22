"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { InstallBanner } from "@/components/InstallBanner";
import { addDays, today } from "@/lib/date";
import { phraseOfDay } from "@/lib/phrases";
import { needsRest, type Condition, type Todo } from "@/lib/types";

const MAX_TODOS = 3;

export default function HomePage() {
  const { profile } = useProfile();
  const supabase = createClient();
  const date = today();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [streak, setStreak] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const [newTodo, setNewTodo] = useState("");
  const [showTodosAnyway, setShowTodosAnyway] = useState(false);

  const load = useCallback(async () => {
    const [t, s, p, c, last] = await Promise.all([
      supabase.from("todos").select("*").eq("date", date).order("id"),
      supabase.rpc("record_streak", { p_today: date }),
      supabase.rpc("cycle_phase", { p_today: date }),
      supabase.from("conditions").select("*").eq("date", date).maybeSingle(),
      supabase.from("recorded_days").select("date").lt("date", date).order("date", { ascending: false }).limit(1),
    ]);
    setTodos((t.data as Todo[]) ?? []);
    setStreak((s.data as number) ?? 0);
    setPhase((p.data as string) ?? null);
    setCondition((c.data as Condition) ?? null);
    setLastRecorded(last.data?.[0]?.date ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text || todos.length >= MAX_TODOS) return;
    setNewTodo("");
    await supabase.from("todos").insert({ date, text, source: "self" });
    load();
  }

  async function toggle(todo: Todo) {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    await supabase.from("todos").update({ done: !todo.done }).eq("id", todo.id);
    load();
  }

  async function remove(todo: Todo) {
    setTodos((ts) => ts.filter((t) => t.id !== todo.id));
    await supabase.from("todos").delete().eq("id", todo.id);
  }

  // 2日以上あいたら「おかえり」で迎える（責めない）
  const welcomeBack = lastRecorded !== null && lastRecorded < addDays(date, -1);
  const hour = new Date().getHours();
  const greeting = welcomeBack ? "おかえり" : hour < 11 ? "おはよう" : hour < 18 ? "こんにちは" : "おつかれさま";
  const rest = needsRest(condition);

  return (
    <div className="space-y-4 pt-6">
      <InstallBanner />

      <header>
        <p className="text-sm text-nasu-500">{date.replaceAll("-", "/")}</p>
        <h1 className="text-2xl font-bold text-nasu-700">
          {greeting}、{profile.nickname}さん
        </h1>
        {welcomeBack && <p className="mt-1 text-sm text-nasu-600">また来てくれてうれしい。今日からまた一緒にやろう。</p>}
      </header>

      <section className="card bg-nasu-50">
        <p className="text-xs font-semibold text-nasu-500">今日のひとこと</p>
        <p className="mt-1 leading-relaxed">{phraseOfDay(date)}</p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <p className="text-xs text-nasu-500">続いている日数</p>
          <p className="mt-1 text-3xl font-bold text-nasu-600">
            {streak ?? "–"}
            <span className="ml-1 text-sm font-normal">日</span>
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-nasu-500">いまの時期</p>
          <p className="mt-2 text-lg font-semibold text-nasu-700">{phase ?? "未登録"}</p>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-3 font-bold text-nasu-700">今日やること</h2>
        {rest && !showTodosAnyway ? (
          <div className="rounded-xl bg-leaf-100 p-4">
            <p className="font-semibold text-leaf-600">今日は休む日</p>
            <p className="mt-1 text-sm">
              体調がよくないみたい。今日やることは「休む」だけ。あたたかくして、ゆっくりね。
            </p>
            <button className="mt-2 text-xs text-nasu-500 underline" onClick={() => setShowTodosAnyway(true)}>
              やることを表示する
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {todos.map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <button
                    aria-label={t.done ? "未完了にする" : "完了にする"}
                    onClick={() => toggle(t)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                      t.done ? "border-leaf-400 bg-leaf-400 text-white" : "border-nasu-300"
                    }`}
                  >
                    {t.done && "✓"}
                  </button>
                  <span className={`flex-1 ${t.done ? "text-nasu-400 line-through" : ""}`}>{t.text}</span>
                  <button aria-label="削除" className="px-2 text-nasu-300" onClick={() => remove(t)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {todos.length === 0 && <p className="text-sm text-nasu-500">今日できそうなことを、3つまで決めよう。</p>}
            {todos.length < MAX_TODOS && (
              <form onSubmit={addTodo} className="mt-3 flex gap-2">
                <input
                  className="input py-2"
                  placeholder="例：夜ごはんは野菜から食べる"
                  maxLength={60}
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                />
                <button className="btn-soft shrink-0 px-3 py-2">追加</button>
              </form>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/chat" className="btn-primary py-5 text-base">
          食べる前に相談
        </Link>
        <Link href="/record" className="btn bg-leaf-400 py-5 text-base text-white">
          記録する
        </Link>
      </div>
    </div>
  );
}
