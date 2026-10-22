export type Profile = {
  id: string;
  role: "owner" | "partner";
  nickname: string;
  height_cm: number | null;
  target_weight_kg: number | null;
  body_notes: string | null;
  cycle_length_days: number;
  consent_ai: boolean;
  consent_decided_at: string | null;
  notify_morning: string;
  notify_evening: string;
  notify_work_end: boolean;
  timezone: string;
  onboarded_at: string | null;
};

export type Todo = {
  id: number;
  date: string;
  text: string;
  done: boolean;
  source: "coach" | "self";
};

export type Condition = {
  id: number;
  date: string;
  fever_c: number | null;
  stomach: Level | null;
  fatigue: Level | null;
  note: string | null;
};

export type Level = "good" | "so-so" | "bad";

export const MIN_TARGET_WEIGHT = 46;

// 発熱などで「休む日」にする目安
export function needsRest(c: Pick<Condition, "fever_c" | "stomach" | "fatigue"> | null): boolean {
  if (!c) return false;
  return (c.fever_c ?? 0) >= 37.5 || c.stomach === "bad" || c.fatigue === "bad";
}

export type Reward = {
  id: number;
  week_start: string;
  title: string;
  required_days: number;
  achieved_at: string | null;
};

export type Schedule = {
  id: number;
  starts_at: string;
  ends_at: string;
  kind: "work" | "pilates" | "other";
  title: string | null;
};

export type EventItem = { id: number; date: string; title: string };

export const SCHEDULE_KIND: Record<Schedule["kind"], string> = { work: "バイト", pilates: "ピラティス", other: "予定" };
