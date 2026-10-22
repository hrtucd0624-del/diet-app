"use client";

import { today } from "@/lib/date";

// 記録の日付。未来の日は選べない（iPhone の Safari は max を守らないことがあるので、選んでも今日に戻す）
export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const max = today();
  return (
    <input
      type="date"
      className="input"
      value={value}
      max={max}
      required
      onChange={(e) => {
        const v = e.target.value;
        if (v) onChange(v > max ? max : v);
      }}
    />
  );
}
