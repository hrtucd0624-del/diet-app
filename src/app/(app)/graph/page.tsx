"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { addDays, formatMD, today } from "@/lib/date";

type Point = { date: string; weight_kg: number; avg7_kg: number };
const RANGES = [
  { days: 14, label: "2週間" },
  { days: 30, label: "1か月" },
  { days: 90, label: "3か月" },
];

export default function GraphPage() {
  const { profile } = useProfile();
  const [range, setRange] = useState(30);
  const [points, setPoints] = useState<Point[]>([]);
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  const [asked, setAsked] = useState(0);
  const [streak, setStreak] = useState(0);

  const end = today();
  const start = addDays(end, -(range - 1));

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // 7日平均を正しく出すため、表示範囲より6日前から取る
      const [w, r, a, s] = await Promise.all([
        supabase.from("weights_with_avg").select("date, weight_kg, avg7_kg").gte("date", addDays(start, -6)).lte("date", end).order("date"),
        supabase.from("recorded_days").select("date").gte("date", start).lte("date", end),
        supabase.from("meals").select("id", { count: "exact", head: true }).eq("asked_before", true).gte("date", start).lte("date", end),
        supabase.rpc("record_streak", { p_today: end }),
      ]);
      setPoints(
        ((w.data as Point[]) ?? [])
          .filter((p) => p.date >= start)
          .map((p) => ({ ...p, weight_kg: Number(p.weight_kg), avg7_kg: Number(p.avg7_kg) })),
      );
      setRecorded(new Set(((r.data as { date: string }[]) ?? []).map((d) => d.date)));
      setAsked(a.count ?? 0);
      setStreak((s.data as number) ?? 0);
    })();
  }, [start, end]);

  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-xl font-bold text-nasu-700">グラフ</h1>

      <div className="flex gap-1 rounded-xl bg-nasu-100 p-1">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setRange(r.days)}
            className={`flex-1 rounded-lg py-2 text-sm ${range === r.days ? "bg-white font-bold text-nasu-700 shadow-sm" : "text-nasu-500"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <section className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold text-nasu-700">体重</h2>
          {points.length > 0 && (
            <p className="text-sm text-nasu-600">
              7日平均 <b className="text-lg">{points[points.length - 1].avg7_kg.toFixed(1)}</b> kg
            </p>
          )}
        </div>
        <WeightChart points={points} start={start} end={end} target={profile.target_weight_kg} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-nasu-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-5 rounded bg-nasu-500" /> 7日平均
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-nasu-200" /> 毎日の体重
          </span>
          {profile.target_weight_kg && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-dashed border-leaf-400" /> 目標
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-nasu-500">毎日の数字は水分などで上下します。見るのは線の向きだけで大丈夫。</p>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="続いている" value={streak} unit="日" />
        <Stat label="記録した日" value={recorded.size} unit="日" />
        <Stat label="相談できた" value={asked} unit="回" />
      </div>

      <section className="card">
        <h2 className="mb-3 font-bold text-nasu-700">記録できた日</h2>
        <DayDots start={start} days={range} recorded={recorded} />
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="card px-2 text-center">
      <p className="text-xs text-nasu-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-nasu-600">
        {value}
        <span className="ml-0.5 text-xs font-normal">{unit}</span>
      </p>
    </div>
  );
}

function WeightChart({
  points,
  start,
  end,
  target,
}: {
  points: Point[];
  start: string;
  end: string;
  target: number | null;
}) {
  const W = 340;
  const H = 200;
  const pad = { l: 34, r: 8, t: 10, b: 22 };

  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const dayIndex = (iso: string) => (Date.parse(iso) - Date.parse(start)) / 86400000;
    const totalDays = Math.max(1, dayIndex(end));
    const values = points.flatMap((p) => [p.weight_kg, p.avg7_kg]);
    if (target) values.push(target);
    let lo = Math.floor(Math.min(...values) - 0.5);
    let hi = Math.ceil(Math.max(...values) + 0.5);
    if (hi - lo < 3) {
      const mid = (hi + lo) / 2;
      lo = Math.floor(mid - 1.5);
      hi = Math.ceil(mid + 1.5);
    }
    const x = (iso: string) => pad.l + (dayIndex(iso) / totalDays) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
    const step = Math.max(1, Math.ceil((hi - lo) / 4));
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.avg7_kg).toFixed(1)}`).join(" ");
    return { x, y, ticks, line };
  }, [points, start, end, target, pad.l, pad.r, pad.t, pad.b]);

  if (!chart) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-nasu-50 text-sm text-nasu-500">
        体重を記録すると、ここに線が出てくるよ
      </div>
    );
  }
  const { x, y, ticks, line } = chart;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="体重の推移">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#eee5f4" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#a07cbd">
            {v}
          </text>
        </g>
      ))}
      <text x={pad.l} y={H - 6} fontSize="10" fill="#a07cbd">
        {formatMD(start)}
      </text>
      <text x={W - pad.r} y={H - 6} fontSize="10" fill="#a07cbd" textAnchor="end">
        {formatMD(end)}
      </text>
      {target && (
        <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="#79b089" strokeWidth="1.5" strokeDasharray="4 4" />
      )}
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight_kg)} r="2.5" fill="#dccbe8" />
      ))}
      <path d={line} fill="none" stroke="#7f5a9f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DayDots({ start, days, recorded }: { start: string; days: number; recorded: Set<string> }) {
  const all = Array.from({ length: days }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {all.map((d) => (
        <div
          key={d}
          title={formatMD(d)}
          className={`aspect-square rounded-md ${recorded.has(d) ? "bg-leaf-400" : "bg-nasu-50"}`}
        />
      ))}
    </div>
  );
}
