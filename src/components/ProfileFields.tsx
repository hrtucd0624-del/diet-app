"use client";

import { MIN_TARGET_WEIGHT } from "@/lib/types";

// 初回設定と設定画面で共通の入力欄
export function TargetWeightInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const n = Number(value);
  const tooLow = value !== "" && n < MIN_TARGET_WEIGHT;
  return (
    <div>
      <label className="label" htmlFor="target">目標体重（kg）</label>
      <input
        id="target"
        type="number"
        inputMode="decimal"
        step="0.1"
        min={MIN_TARGET_WEIGHT}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className={`mt-1 text-xs ${tooLow ? "font-semibold text-sun-500" : "text-nasu-500"}`}>
        {MIN_TARGET_WEIGHT}kg 以上で設定してね。体を大事にするための下限です。
      </p>
    </div>
  );
}

export function isValidTarget(value: string): boolean {
  if (value === "") return true;
  const n = Number(value);
  return Number.isFinite(n) && n >= MIN_TARGET_WEIGHT && n <= 150;
}

export function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
