"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "./ProfileProvider";
import { useTextGuard } from "./useTextGuard";
import { callCoach } from "@/lib/coach";
import { addDays } from "@/lib/date";
import type { Todo } from "@/lib/types";

const HIDDEN_KEY = "todo-suggestions-hidden";
const MAX_CHIPS = 12;

function loadHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// 今日やること。数の上限はなし。前に書いたことはワンタップで追加できる
export function TodayTodos({
  date,
  onChanged,
  onComment,
}: {
  date: string;
  onChanged?: () => void;
  onComment?: (text: string) => void;
}) {
  const supabase = createClient();
  const { profile } = useProfile();
  const { guard, modal } = useTextGuard();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [past, setPast] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from("todos").select("*").eq("date", date).order("id"),
      // 過去60日に書いたこと（よく書いたもの・最近のものを上に）
      supabase.from("todos").select("text, date").lt("date", date).gte("date", addDays(date, -60)).order("date", { ascending: false }).limit(300),
    ]);
    setTodos((t.data as Todo[]) ?? []);
    const score = new Map<string, number>();
    ((p.data as { text: string; date: string }[]) ?? []).forEach((r, i) => {
      score.set(r.text, (score.get(r.text) ?? 0) + 10 + Math.max(0, 5 - i / 20));
    });
    setPast([...score.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    setHidden(loadHidden());
    load();
  }, [load]);

  async function insert(text: string) {
    const { error } = await supabase.from("todos").insert({ date, text, source: "self" });
    if (error) setError("追加できませんでした。もう一度ためしてね。");
    await load();
    onChanged?.();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let text = newTodo.trim();
    if (!text) return;
    // やることはコーチにも渡るので、送信前チェックを通す
    if (profile.consent_ai) {
      const checked = await guard(text);
      if (checked === null) return;
      text = checked;
    }
    setNewTodo("");
    insert(text);
  }

  async function toggle(todo: Todo) {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    await supabase.from("todos").update({ done: !todo.done }).eq("id", todo.id);
    onChanged?.();
  }

  async function saveEdit(todo: Todo) {
    let text = editText.trim();
    setEditingId(null);
    if (!text || text === todo.text) return;
    if (profile.consent_ai) {
      const checked = await guard(text);
      if (checked === null) return;
      text = checked;
    }
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, text } : t)));
    await supabase.from("todos").update({ text }).eq("id", todo.id);
    load();
  }

  async function remove(todo: Todo) {
    setTodos((ts) => ts.filter((t) => t.id !== todo.id));
    await supabase.from("todos").delete().eq("id", todo.id);
    onChanged?.();
  }

  function hide(text: string) {
    const next = [...hidden, text];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {}
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    const res = await callCoach<{ comment: string; added: number }>("suggest_todos");
    setSuggesting(false);
    if (!res.ok) return setError(res.message);
    if (res.data.comment) onComment?.(res.data.comment);
    load();
  }

  const todayTexts = new Set(todos.map((t) => t.text));
  const chips = past.filter((t) => !todayTexts.has(t) && !hidden.includes(t)).slice(0, MAX_CHIPS);

  return (
    <div className="space-y-3">
      {todos.length > 0 ? (
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
              {editingId === t.id ? (
                <input
                  autoFocus
                  className="input flex-1 py-1.5"
                  maxLength={60}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => saveEdit(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className={`flex-1 text-left ${t.done ? "text-nasu-400 line-through" : ""}`}
                  onClick={() => {
                    setEditingId(t.id);
                    setEditText(t.text);
                  }}
                  aria-label={`「${t.text}」を書き直す`}
                >
                  {t.text}
                  {t.source === "coach" && <span className="ml-1 text-[10px] text-nasu-400">コーチ</span>}
                </button>
              )}
              <button aria-label="削除" className="px-2 text-nasu-300" onClick={() => remove(t)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-nasu-500">今日できそうなことを決めよう。下の候補からも選べるよ。</p>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          className="input py-2"
          placeholder="例：夜ごはんは野菜から食べる"
          maxLength={60}
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
        />
        <button className="btn-soft shrink-0 px-3 py-2">追加</button>
      </form>

      {chips.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-nasu-500">前に書いたこと（タップで追加）</p>
          <div className="flex flex-wrap gap-2">
            {chips.map((text) => (
              <span key={text} className="flex items-center rounded-full bg-nasu-50 text-sm text-nasu-700">
                <button className="py-1.5 pl-3 pr-1 text-left" onClick={() => insert(text)}>
                  ＋ {text}
                </button>
                <button aria-label={`「${text}」を候補から外す`} className="px-2 py-1.5 text-xs text-nasu-300" onClick={() => hide(text)}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.consent_ai && (
        <button
          type="button"
          className="w-full rounded-xl border border-dashed border-nasu-300 py-2 text-sm text-nasu-600 disabled:opacity-50"
          onClick={suggest}
          disabled={suggesting}
        >
          {suggesting ? "コーチが考え中…" : "✨ コーチに提案してもらう"}
        </button>
      )}
      {error && <p className="rounded-xl bg-sun-100 p-2 text-xs">{error}</p>}
      <p className="text-[11px] text-nasu-400">やることをタップすると書き直せます。</p>
      {modal}
    </div>
  );
}
