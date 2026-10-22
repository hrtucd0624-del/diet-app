export type Profile = {
  id: string;
  role: "owner" | "partner";
  nickname: string;
  height_cm: number | null;
  target_weight_kg: number | null;
  body_notes: string | null;
  cycle_length_days: number;
  consent_ai: boolean;
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
