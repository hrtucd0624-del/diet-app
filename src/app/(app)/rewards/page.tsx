"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { useTextGuard } from "@/components/useTextGuard";
import { addDays, formatMD, today, weekdayJa } from "@/lib/date";
import { loadWeek, markAchievedIfDone, type WeekState } from "@/lib/week";
import type { Reward } from "@/lib/types";

export default function RewardsPage() {
  const supabase = createClient();
  const { profile } = useProfile();
  const { guard, modal } = useTextGuard();
  const date = today();
  const [week, setWeek] = useState<WeekState | null>(null);
  const [history, setHistory] = useState<Reward[]>([]);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [required, setRequired] = useState(5);
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const w = await loadWeek(supabase, date);
    if (await markAchievedIfDone(supabase, w)) {
      setCelebrate(true);
      return load();
    }
    setWeek(w);
    setTitle(w.reward?.title ?? "");
    setRequired(w.reward?.required_days ?? 5);
    const { data } = await supabase.from("rewards").select("*").lt("week_start", w.monday).order("week_start", { ascending: false }).limit(4);
    setHistory((data as Reward[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!week) return;
    setError(null);
    let safeTitle = title.trim();
    if (!safeTitle) return;
    // ご褒美の名前はコーチにも渡るので、送信前チェックを通す
    if (profile.consent_ai) {
      const checked = await guard(safeTitle);
      if (checked === null) return;
      safeTitle = checked;
    }
    const { error } = await supabase
      .from("rewards")
      .upsert({ week_start: week.monday, title: safeTitle, required_days: required }, { onConflict: "owner_id,week_start" });
    if (error) return setError("保存できませんでした。もう一度ためしてね。");
    setEditing(false);
    load();
  }

  async function applyRestPass(d: string) {
    if (!confirm(`${formatMD(d)}(${weekdayJa(d)}) をお休みの日にしますか？（お休み券はその週に1回だけ）`)) return;
    const { error } = await supabase.from("rest_passes").insert({ date: d });
    if (error) return setError("使えませんでした。その週はもう使ったかもしれません。");
    load();
  }

  if (!week) return <div className="p-8 text-center text-sm text-nasu-500">読み込み中…</div>;

  const days = Array.from({ length: 7 }, (_, i) => addDays(week.monday, i));
  const reward = week.reward;
  const left = reward ? Math.max(0, reward.required_days - week.daysDone) : null;
  const thisWeekPassUsed = week.restWeeks.has(week.monday);

  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-xl font-bold text-nasu-700">今週のご褒美</h1>

      {celebrate && (
        <div className="card bg-leaf-100 text-center ring-leaf-100">
          <p className="text-3xl">🎉</p>
          <p className="mt-1 font-bold text-leaf-600">今週のご褒美、達成！</p>
          <p className="mt-1 text-sm">ちゃんと続けた自分に、{reward?.title}をどうぞ。</p>
        </div>
      )}

      <section className="card space-y-4">
        {reward && !editing ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-nasu-500">ご褒美</p>
                <p className="text-lg font-bold text-nasu-700">🎁 {reward.title}</p>
              </div>
              <button className="text-sm text-nasu-500 underline" onClick={() => setEditing(true)}>
                変える
              </button>
            </div>
            <p className="text-sm">
              条件：今週 <b>{reward.required_days}日</b> 続ける（記録した日・お休み券の日）
            </p>
            <p className="text-center text-2xl font-bold text-nasu-600">
              {reward.achieved_at ? "達成！" : `あと ${left} 日`}
            </p>
          </>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <p className="text-sm text-nasu-600">食べ物以外で、今週がんばった自分にあげたいもの。</p>
            <div>
              <label className="label">ご褒美</label>
              <input
                className="input"
                placeholder="例：新しい服を1つ"
                maxLength={30}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label">条件：今週何日続けたら？</label>
              <div className="grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setRequired(n)}
                    className={`rounded-lg py-2 text-sm ${required === n ? "bg-nasu-500 text-white" : "bg-nasu-50 text-nasu-600"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="rounded-xl bg-sun-100 p-3 text-sm">{error}</p>}
            <div className="flex gap-2">
              {reward && (
                <button type="button" className="btn-soft flex-1" onClick={() => setEditing(false)}>
                  やめる
                </button>
              )}
              <button className="btn-primary flex-[2]">決める</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {days.map((d) => {
            const isRest = week.restDates.has(d);
            const done = week.doneDates.has(d);
            const future = d > date;
            return (
              <div key={d}>
                <p className="text-nasu-500">{weekdayJa(d)}</p>
                <div
                  className={`mx-auto mt-1 flex aspect-square w-full items-center justify-center rounded-lg ${
                    isRest ? "bg-sun-100" : done ? "bg-leaf-400 text-white" : future ? "bg-nasu-50/50" : "bg-nasu-50"
                  } ${d === date ? "ring-2 ring-nasu-300" : ""}`}
                >
                  {isRest ? "☕" : done ? "✓" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-nasu-700">☕ お休み券</h2>
        <p className="text-sm">
          週に1回、記録できなかった日を「お休みの日」にできます。連続記録は切れません。
          今週の券は <b>{thisWeekPassUsed ? "使用ずみ" : "残っています"}</b>。
        </p>
        {week.restCandidates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {week.restCandidates.map((d) => (
              <button key={d} className="rounded-full bg-sun-100 px-3 py-1.5 text-sm" onClick={() => applyRestPass(d)}>
                {formatMD(d)}({weekdayJa(d)}) を休みにする
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-nasu-500">今、お休みにできる日はありません。</p>
        )}
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-nasu-600">これまでのご褒美</h2>
          <ul className="divide-y divide-nasu-50 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <span>
                  <span className="text-nasu-500">{formatMD(r.week_start)}の週</span> {r.title}
                </span>
                <span className={r.achieved_at ? "text-leaf-600" : "text-nasu-400"}>{r.achieved_at ? "達成 🎉" : "また次の週に"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {modal}
    </div>
  );
}
