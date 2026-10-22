"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { InstallBanner } from "@/components/InstallBanner";
import { addDays, daysBetween, formatMD, today, weekdayJa } from "@/lib/date";
import { loadWeek, markAchievedIfDone, type WeekState } from "@/lib/week";
import { currentNudge, type Nudge } from "@/lib/nudge";
import { phraseOfDay } from "@/lib/phrases";
import { needsRest, type Condition, type EventItem, type Schedule } from "@/lib/types";
import { TodayTodos } from "@/components/TodayTodos";

const COMMENT_KEY = "coach-comment";

function loadComment(date: string): string | null {
  try {
    const c = JSON.parse(localStorage.getItem(COMMENT_KEY) ?? "null");
    return c?.date === date ? String(c.text) : null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const { profile } = useProfile();
  const supabase = createClient();
  const date = today();

  const [streak, setStreak] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const [showTodosAnyway, setShowTodosAnyway] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekState | null>(null);
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    setComment(loadComment(date));
  }, [date]);

  const load = useCallback(async () => {
    const dayStart = new Date(`${date}T00:00`).toISOString();
    const dayEnd = new Date(`${addDays(date, 1)}T00:00`).toISOString();
    const [s, p, c, last, ev, sch, wt, w] = await Promise.all([
      supabase.rpc("record_streak", { p_today: date }),
      supabase.rpc("cycle_phase", { p_today: date }),
      supabase.from("conditions").select("*").eq("date", date).maybeSingle(),
      supabase.from("streak_days").select("date").lt("date", date).order("date", { ascending: false }).limit(1),
      supabase.from("events").select("*").gte("date", date).order("date").limit(1).maybeSingle(),
      supabase.from("schedules").select("*").gte("ends_at", dayStart).lt("starts_at", dayEnd),
      supabase.from("weights").select("id").eq("date", date).maybeSingle(),
      loadWeek(supabase, date),
    ]);
    if (await markAchievedIfDone(supabase, w)) w.reward = { ...w.reward!, achieved_at: new Date().toISOString() };
    setWeek(w);
    setNextEvent((ev.data as EventItem) ?? null);
    setNudge(
      currentNudge({
        now: new Date(),
        morning: profile.notify_morning,
        evening: profile.notify_evening,
        weightRecorded: !!wt.data,
        schedules: (sch.data as Schedule[]) ?? [],
      }),
    );
    setStreak((s.data as number) ?? 0);
    setPhase((p.data as string) ?? null);
    setCondition((c.data as Condition) ?? null);
    setLastRecorded(last.data?.[0]?.date ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function applyYesterdayRestPass() {
    const y = addDays(date, -1);
    await supabase.from("rest_passes").insert({ date: y });
    load();
  }

  // 2日以上あいたら「おかえり」で迎える（責めない）
  const welcomeBack = lastRecorded !== null && lastRecorded < addDays(date, -1);
  const hour = new Date().getHours();
  const greeting = welcomeBack ? "おかえり" : hour < 11 ? "おはよう" : hour < 18 ? "こんにちは" : "おつかれさま";
  const rest = needsRest(condition);
  const restOffer = week?.restCandidates.includes(addDays(date, -1)) && !!lastRecorded;
  const rewardLeft = week?.reward ? Math.max(0, week.reward.required_days - week.daysDone) : null;

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

      {nudge && (
        <Link href={nudge.href} className="card flex items-center gap-3 bg-sun-100 ring-sun-100">
          <span className="text-2xl" aria-hidden>
            🔔
          </span>
          <span className="flex-1 text-sm leading-relaxed">{nudge.text}</span>
          <span className="shrink-0 text-xs font-semibold text-nasu-600">{nudge.action} ›</span>
        </Link>
      )}

      {restOffer && (
        <section className="card space-y-2">
          <p className="text-sm">
            昨日（{formatMD(addDays(date, -1))}）は記録がなかったね。休むのも大事。<b>お休み券</b>を使えば、続いている日数はそのままだよ。
          </p>
          <button className="btn-soft w-full py-2 text-sm" onClick={applyYesterdayRestPass}>
            ☕ 昨日をお休みの日にする
          </button>
        </section>
      )}

      <section className="card bg-nasu-50">
        <p className="text-xs font-semibold text-nasu-500">{comment ? "コーチから今日の一言" : "今日のひとこと"}</p>
        <p className="mt-1 leading-relaxed">{comment ?? phraseOfDay(date)}</p>
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

      <div className="grid grid-cols-2 gap-3">
        <Link href="/rewards" className="card text-center">
          <p className="text-xs text-nasu-500">今週のご褒美</p>
          {week?.reward ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold text-nasu-700">🎁 {week.reward.title}</p>
              <p className="mt-1 text-lg font-bold text-nasu-600">{week.reward.achieved_at ? "達成！🎉" : `あと ${rewardLeft} 日`}</p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-nasu-600">決めよう ›</p>
          )}
        </Link>
        <Link href="/plan" className="card text-center">
          <p className="text-xs text-nasu-500">{nextEvent ? nextEvent.title : "楽しみな日"}</p>
          {nextEvent ? (
            <p className="mt-1 text-3xl font-bold text-nasu-600">
              {daysBetween(date, nextEvent.date) === 0 ? "今日！" : daysBetween(date, nextEvent.date)}
              {daysBetween(date, nextEvent.date) > 0 && <span className="ml-1 text-sm font-normal">日</span>}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-nasu-600">登録しよう ›</p>
          )}
          {nextEvent && (
            <p className="text-xs text-nasu-400">
              {formatMD(nextEvent.date)}({weekdayJa(nextEvent.date)})
            </p>
          )}
        </Link>
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
          <TodayTodos
            date={date}
            onChanged={load}
            onComment={(text) => {
              setComment(text);
              try {
                localStorage.setItem(COMMENT_KEY, JSON.stringify({ date, text }));
              } catch {}
            }}
          />
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/chat?topic=before" className="btn-primary py-5 text-base">
          食べる前に相談
        </Link>
        <Link href="/record" className="btn bg-leaf-400 py-5 text-base text-white">
          記録する
        </Link>
      </div>
    </div>
  );
}
