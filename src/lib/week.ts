import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, mondayOf } from "@/lib/date";
import type { Reward } from "@/lib/types";

export type WeekState = {
  monday: string;
  reward: Reward | null;
  daysDone: number; // 今週続いた日（記録＋お休み券）
  doneDates: Set<string>; // 直近14日の続いた日
  restDates: Set<string>; // 直近14日のお休み券を使った日
  restWeeks: Set<string>; // お休み券を使った週（月曜の日付）
  restCandidates: string[]; // お休み券を使える日（記録がなく、その週の券が残っている過去6日）
};

export async function loadWeek(supabase: SupabaseClient, today: string): Promise<WeekState> {
  const monday = mondayOf(today);
  const since = addDays(today, -13);
  const [reward, done, days, rests] = await Promise.all([
    supabase.from("rewards").select("*").eq("week_start", monday).maybeSingle(),
    supabase.rpc("week_days_done", { p_today: today }),
    supabase.from("recorded_days").select("date").gte("date", since).lte("date", today),
    supabase.from("rest_passes").select("date, week_start").gte("date", addDays(since, -7)),
  ]);
  const restRows = (rests.data as { date: string; week_start: string }[]) ?? [];
  const restDates = new Set(restRows.map((r) => r.date));
  const restWeeks = new Set(restRows.map((r) => r.week_start));
  const recorded = new Set(((days.data as { date: string }[]) ?? []).map((d) => d.date));
  const doneDates = new Set([...recorded, ...restDates]);

  const restCandidates: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = addDays(today, -i);
    if (!doneDates.has(d) && !restWeeks.has(mondayOf(d))) restCandidates.push(d);
  }

  return {
    monday,
    reward: (reward.data as Reward) ?? null,
    daysDone: Number(done.data ?? 0),
    doneDates,
    restDates,
    restWeeks,
    restCandidates,
  };
}

// 達成していたら記録する（達成した時だけ true）
export async function markAchievedIfDone(supabase: SupabaseClient, w: WeekState): Promise<boolean> {
  if (!w.reward || w.reward.achieved_at || w.daysDone < w.reward.required_days) return false;
  const { error } = await supabase.from("rewards").update({ achieved_at: new Date().toISOString() }).eq("id", w.reward.id);
  return !error;
}
