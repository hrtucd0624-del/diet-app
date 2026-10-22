import type { Schedule } from "@/lib/types";

// 通知と同じ内容を、アプリを開いた時にもホームに出す（iOS の通知は止まることがあるため）
export type Nudge = { text: string; href: string; action: string };

const AFTER_WORK_FOODS = ["ゆで卵", "具だくさんのお味噌汁", "温かいお茶とゆで卵", "小さめの玄米おにぎり", "白湯とゆで卵"];

function minutesOf(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function currentNudge(opts: {
  now: Date;
  morning: string;
  evening: string;
  weightRecorded: boolean;
  schedules: Schedule[];
}): Nudge | null {
  const { now } = opts;
  const mins = now.getHours() * 60 + now.getMinutes();

  // バイトが終わってから3時間以内（いちばん優先）
  const work = opts.schedules
    .filter((s) => s.kind === "work")
    .find((s) => {
      const end = new Date(s.ends_at).getTime();
      return end <= now.getTime() && now.getTime() - end < 3 * 3600 * 1000;
    });
  if (work) {
    const food = AFTER_WORK_FOODS[work.id % AFTER_WORK_FOODS.length];
    return { text: `お疲れさま。今いちばん甘いものが欲しくなる時間。帰ったら最初に${food}を食べよう`, href: "/chat", action: "コーチに相談" };
  }
  if (mins >= minutesOf(opts.evening)) {
    return { text: "今日の振り返りをしよう", href: "/chat?topic=evening", action: "振り返る" };
  }
  if (mins >= minutesOf(opts.morning) && mins < 12 * 60 && !opts.weightRecorded) {
    return { text: "おはよう。体重と今日やることを決めよう", href: "/record?tab=weight", action: "体重を記録" };
  }
  return null;
}
