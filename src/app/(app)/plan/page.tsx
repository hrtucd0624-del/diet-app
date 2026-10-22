"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { useTextGuard } from "@/components/useTextGuard";
import { addDays, daysBetween, formatMD, toISODate, today, weekdayJa } from "@/lib/date";
import { SCHEDULE_KIND, type EventItem, type Schedule } from "@/lib/types";

function hm(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PlanPage() {
  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-xl font-bold text-nasu-700">予定</h1>
      <ScheduleSection />
      <EventSection />
    </div>
  );
}

// ---------------------------------------------------------------- バイトなどの予定
function ScheduleSection() {
  const supabase = createClient();
  const { profile } = useProfile();
  const { guard, modal } = useTextGuard();
  const [date, setDate] = useState(today());
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("18:00");
  const [kind, setKind] = useState<Schedule["kind"]>("work");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const from = new Date(`${today()}T00:00`).toISOString();
    const { data } = await supabase.from("schedules").select("*").gte("ends_at", from).order("starts_at").limit(20);
    setRows((data as Schedule[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let safeTitle = title.trim();
    // 予定の名前はコーチにも渡るので、送信前チェックを通す
    if (profile.consent_ai && safeTitle) {
      const checked = await guard(safeTitle);
      if (checked === null) return;
      safeTitle = checked;
    }
    const startsAt = new Date(`${date}T${start}`);
    // 終わりが始まりより前なら、日をまたぐ予定とみなす
    const endDate = end <= start ? addDays(date, 1) : date;
    const endsAt = new Date(`${endDate}T${end}`);
    const { error } = await supabase.from("schedules").insert({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      kind,
      title: safeTitle || null,
    });
    if (error) return setError("保存できませんでした。もう一度ためしてね。");
    setTitle("");
    load();
  }

  async function remove(id: number) {
    await supabase.from("schedules").delete().eq("id", id);
    load();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-nasu-700">バイト・ピラティスなど</h2>
      <form onSubmit={save} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SCHEDULE_KIND) as Schedule["kind"][]).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-sm ${kind === k ? "bg-nasu-500 text-white" : "bg-nasu-50 text-nasu-600"}`}
            >
              {SCHEDULE_KIND[k]}
            </button>
          ))}
        </div>
        <div>
          <label className="label">日付</label>
          <input type="date" className="input" min={today()} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">はじまり</label>
            <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div>
            <label className="label">おわり</label>
            <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label">メモ（なくてもOK・お店の名前は書かないでね）</label>
          <input className="input" maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {error && <p className="rounded-xl bg-sun-100 p-3 text-sm">{error}</p>}
        <button className="btn-primary w-full">予定を追加</button>
        {kind === "work" && (
          <p className="text-xs text-nasu-500">バイトの終わる時刻に「お疲れさま」の通知が届きます（通知をオンにしている時）。</p>
        )}
      </form>

      {rows.length > 0 && (
        <ul className="divide-y divide-nasu-50 border-t border-nasu-50 text-sm">
          {rows.map((r) => {
            const d = toISODate(new Date(r.starts_at));
            return (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <span className="w-16 text-nasu-500">
                  {formatMD(d)}({weekdayJa(d)})
                </span>
                <span className="flex-1">
                  {r.title || SCHEDULE_KIND[r.kind]}
                  <span className="ml-2 text-nasu-400">
                    {hm(r.starts_at)}-{hm(r.ends_at)}
                  </span>
                </span>
                <button aria-label="削除" className="px-2 text-nasu-300" onClick={() => remove(r.id)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {modal}
    </section>
  );
}

// ---------------------------------------------------------------- イベント（カウントダウン）
function EventSection() {
  const supabase = createClient();
  const { profile } = useProfile();
  const { guard, modal } = useTextGuard();
  const [date, setDate] = useState(addDays(today(), 14));
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("events").select("*").gte("date", today()).order("date").limit(20);
    setRows((data as EventItem[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let safeTitle = title.trim();
    if (!safeTitle) return;
    if (profile.consent_ai) {
      const checked = await guard(safeTitle);
      if (checked === null) return;
      safeTitle = checked;
    }
    const { error } = await supabase.from("events").insert({ date, title: safeTitle });
    if (error) return setError("保存できませんでした。もう一度ためしてね。");
    setTitle("");
    load();
  }

  async function remove(id: number) {
    if (!confirm("このイベントを消しますか？")) return;
    await supabase.from("events").delete().eq("id", id);
    load();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-nasu-700">楽しみなイベント</h2>
      <p className="text-xs text-nasu-500">ホームにカウントダウンが出ます。場所は書かず「大切な人に会う日」のように書いてね。</p>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">日付</label>
          <input type="date" className="input" min={today()} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">なんの日？</label>
          <input
            className="input"
            placeholder="例：大切な人に会う日"
            maxLength={30}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {error && <p className="rounded-xl bg-sun-100 p-3 text-sm">{error}</p>}
        <button className="btn-primary w-full">イベントを追加</button>
      </form>

      {rows.length > 0 && (
        <ul className="divide-y divide-nasu-50 border-t border-nasu-50 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <span className="w-16 text-nasu-500">{formatMD(r.date)}</span>
              <span className="flex-1">{r.title}</span>
              <span className="text-nasu-600">あと {daysBetween(today(), r.date)} 日</span>
              <button aria-label="削除" className="px-2 text-nasu-300" onClick={() => remove(r.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {modal}
    </section>
  );
}
