"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileProvider";
import { formatMD, today } from "@/lib/date";
import { shrinkImage } from "@/lib/image";
import type { Condition, Level } from "@/lib/types";

const TABS = [
  { id: "weight", label: "体重" },
  { id: "meal", label: "食事" },
  { id: "exercise", label: "運動" },
  { id: "condition", label: "体調" },
  { id: "cycle", label: "生理" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function RecordPage() {
  return (
    <Suspense>
      <RecordTabs />
    </Suspense>
  );
}

function RecordTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "weight") as TabId;
  const [saved, setSaved] = useState<string | null>(null);

  const done = useCallback((msg = "記録したよ") => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  }, []);

  return (
    <div className="pt-6">
      <h1 className="mb-4 text-xl font-bold text-nasu-700">記録する</h1>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-nasu-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => router.replace(`/record?tab=${t.id}`)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
              tab === t.id ? "bg-white font-bold text-nasu-700 shadow-sm" : "text-nasu-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "weight" && <WeightForm onSaved={done} />}
      {tab === "meal" && <MealForm onSaved={done} />}
      {tab === "exercise" && <ExerciseForm onSaved={done} />}
      {tab === "condition" && <ConditionForm onSaved={done} />}
      {tab === "cycle" && <CycleForm onSaved={done} />}

      {saved && (
        <div className="fixed inset-x-0 bottom-24 z-20 mx-auto w-fit rounded-full bg-leaf-600 px-5 py-2 text-sm text-white shadow">
          {saved}
        </div>
      )}
    </div>
  );
}

type FormProps = { onSaved: (msg?: string) => void };

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-xl bg-sun-100 p-3 text-sm">{error}</p>;
}
const SAVE_ERROR = "保存できませんでした。電波を確認して、もう一度ためしてね。";

// ---------------------------------------------------------------- 体重
type WeightRow = { id: number; date: string; weight_kg: number; body_fat_pct: number | null };

function WeightForm({ onSaved }: FormProps) {
  const supabase = createClient();
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("weights").select("*").order("date", { ascending: false }).limit(7);
    setRows((data as WeightRow[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from("weights")
      .upsert(
        { date, weight_kg: Number(weight), body_fat_pct: fat ? Number(fat) : null },
        { onConflict: "owner_id,date" },
      );
    if (error) return setError(SAVE_ERROR);
    setWeight("");
    setFat("");
    onSaved();
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card space-y-3">
        <div>
          <label className="label">日付</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">体重（kg）</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={25}
            max={200}
            required
            className="input text-2xl"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
        <div>
          <label className="label">体脂肪率（%・参考値／なくてもOK）</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={3}
            max={70}
            className="input"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </div>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">記録する</button>
        <p className="text-xs text-nasu-500">同じ日にもう一度記録すると、上書きされます。毎日ゆれるのはふつうのこと。</p>
      </form>

      {rows.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-nasu-600">最近の記録</h2>
          <ul className="divide-y divide-nasu-50 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <span className="text-nasu-500">{formatMD(r.date)}</span>
                <span>
                  {Number(r.weight_kg).toFixed(1)} kg
                  {r.body_fat_pct != null && <span className="ml-2 text-nasu-400">{r.body_fat_pct}%</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 食事
type MealRow = { id: number; eaten_at: string; note: string | null; photo_path: string | null; asked_before: boolean };

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function MealForm({ onSaved }: FormProps) {
  const supabase = createClient();
  const { profile } = useProfile();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [note, setNote] = useState("");
  const [askedBefore, setAskedBefore] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<(MealRow & { url?: string })[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("meals").select("*").eq("date", date).order("eaten_at");
    const meals = (data as MealRow[]) ?? [];
    const paths = meals.map((m) => m.photo_path).filter((p): p is string => !!p);
    const urls: Record<string, string> = {};
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("meal-photos").createSignedUrls(paths, 60 * 60);
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
      });
    }
    setRows(meals.map((m) => ({ ...m, url: m.photo_path ? urls[m.photo_path] : undefined })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  useEffect(() => {
    load();
  }, [load]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      // 端末の中で縮小・EXIF削除してから扱う
      const blob = await shrinkImage(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError("写真を読み込めませんでした。別の写真でためしてね。");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim() && !photo) return setError("写真かメモのどちらかを入れてね。");
    setBusy(true);
    setError(null);
    let photo_path: string | null = null;
    if (photo) {
      const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("meal-photos")
        .upload(path, photo, { contentType: "image/jpeg" });
      if (upErr) {
        setBusy(false);
        return setError(SAVE_ERROR);
      }
      photo_path = path;
    }
    const eaten_at = new Date(`${date}T${time}`).toISOString();
    const { error } = await supabase
      .from("meals")
      .insert({ date, eaten_at, note: note.trim() || null, photo_path, asked_before: askedBefore });
    setBusy(false);
    if (error) return setError(SAVE_ERROR);
    setNote("");
    setPhoto(null);
    setPreview(null);
    setAskedBefore(false);
    setTime(nowTime());
    onSaved();
    load();
  }

  async function remove(m: MealRow) {
    if (!confirm("この食事の記録を消しますか？")) return;
    if (m.photo_path) await supabase.storage.from("meal-photos").remove([m.photo_path]);
    await supabase.from("meals").delete().eq("id", m.id);
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">日付</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">時刻</label>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label">写真（なくてもOK）</label>
          {preview ? (
            <div className="relative">
              <img src={preview} alt="選んだ写真" className="w-full rounded-xl" />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-sm"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                }}
              >
                やめる
              </button>
            </div>
          ) : (
            <label className="btn-soft w-full cursor-pointer">
              📷 写真を選ぶ・撮る
              <input type="file" accept="image/*" className="hidden" onChange={pick} />
            </label>
          )}
          <p className="mt-1 text-xs text-nasu-500">写真は小さくして、位置情報などを消してから保存します。</p>
        </div>
        <div>
          <label className="label">メモ</label>
          <textarea
            className="input min-h-20"
            placeholder="例：おにぎり1つ、お味噌汁"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-nasu-500" checked={askedBefore} onChange={(e) => setAskedBefore(e.target.checked)} />
          食べる前に相談できた
        </label>
        <ErrorNote error={error} />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "保存しています…" : "記録する"}
        </button>
      </form>

      {rows.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-nasu-600">{formatMD(date)} の食事</h2>
          <ul className="space-y-3">
            {rows.map((m) => (
              <li key={m.id} className="flex gap-3">
                {m.url ? (
                  <img src={m.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-nasu-50 text-2xl">🍽️</div>
                )}
                <div className="flex-1 text-sm">
                  <p className="text-nasu-500">
                    {new Date(m.eaten_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    {m.asked_before && <span className="ml-2 rounded bg-leaf-100 px-1.5 text-xs text-leaf-600">相談できた</span>}
                  </p>
                  <p className="whitespace-pre-wrap">{m.note}</p>
                </div>
                <button aria-label="削除" className="self-start px-2 text-nasu-300" onClick={() => remove(m)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 運動
const EXERCISE_KINDS = ["ウォーキング", "ピラティス", "筋トレ", "ストレッチ", "ヨガ", "その他"];
type ExerciseRow = { id: number; date: string; kind: string; minutes: number | null; note: string | null };

function ExerciseForm({ onSaved }: FormProps) {
  const supabase = createClient();
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState(EXERCISE_KINDS[0]);
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("exercises").select("*").order("date", { ascending: false }).order("id", { ascending: false }).limit(10);
    setRows((data as ExerciseRow[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from("exercises")
      .insert({ date, kind, minutes: minutes ? Number(minutes) : null, note: note.trim() || null });
    if (error) return setError(SAVE_ERROR);
    setMinutes("");
    setNote("");
    onSaved("おつかれさま！記録したよ");
    load();
  }

  async function remove(id: number) {
    await supabase.from("exercises").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card space-y-3">
        <div>
          <label className="label">日付</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">種類</label>
          <div className="flex flex-wrap gap-2">
            {EXERCISE_KINDS.map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-sm ${kind === k ? "bg-nasu-500 text-white" : "bg-nasu-50 text-nasu-600"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">時間（分）</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            className="input"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <div>
          <label className="label">メモ</label>
          <input className="input" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">記録する</button>
      </form>

      {rows.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-nasu-600">最近の運動</h2>
          <ul className="divide-y divide-nasu-50 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <span className="w-12 text-nasu-500">{formatMD(r.date)}</span>
                <span className="flex-1">
                  {r.kind}
                  {r.minutes && <span className="ml-2 text-nasu-400">{r.minutes}分</span>}
                </span>
                <button aria-label="削除" className="px-2 text-nasu-300" onClick={() => remove(r.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 体調
const LEVELS: { id: Level; label: string }[] = [
  { id: "good", label: "いい" },
  { id: "so-so", label: "ふつう" },
  { id: "bad", label: "よくない" },
];

function LevelPicker({ value, onChange }: { value: Level | null; onChange: (v: Level) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {LEVELS.map((l) => (
        <button
          type="button"
          key={l.id}
          onClick={() => onChange(l.id)}
          className={`rounded-xl py-2 text-sm ${value === l.id ? "bg-nasu-500 text-white" : "bg-nasu-50 text-nasu-600"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ConditionForm({ onSaved }: FormProps) {
  const supabase = createClient();
  const [date, setDate] = useState(today());
  const [fever, setFever] = useState("");
  const [stomach, setStomach] = useState<Level | null>(null);
  const [fatigue, setFatigue] = useState<Level | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 選んだ日の記録があれば読み込む（1日1件、上書き）
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("conditions").select("*").eq("date", date).maybeSingle();
      const c = data as Condition | null;
      setFever(c?.fever_c?.toString() ?? "");
      setStomach(c?.stomach ?? null);
      setFatigue(c?.fatigue ?? null);
      setNote(c?.note ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from("conditions")
      .upsert(
        { date, fever_c: fever ? Number(fever) : null, stomach, fatigue, note: note.trim() || null },
        { onConflict: "owner_id,date" },
      );
    if (error) return setError(SAVE_ERROR);
    onSaved();
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <div>
        <label className="label">日付</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">熱（℃・測った時だけ）</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={34}
          max={43}
          className="input"
          value={fever}
          onChange={(e) => setFever(e.target.value)}
        />
      </div>
      <div>
        <span className="label">お腹</span>
        <LevelPicker value={stomach} onChange={setStomach} />
      </div>
      <div>
        <span className="label">だるさ</span>
        <LevelPicker value={fatigue} onChange={setFatigue} />
      </div>
      <div>
        <label className="label">メモ</label>
        <textarea className="input min-h-20" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      <button className="btn-primary w-full">記録する</button>
      <p className="text-xs text-nasu-500">熱がある日や体調がよくない日は、ホームの「今日やること」が「休む」になります。</p>
    </form>
  );
}

// ---------------------------------------------------------------- 生理
type CycleRow = { id: number; start_date: string; end_date: string | null };

function CycleForm({ onSaved }: FormProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("cycles").select("*").order("start_date", { ascending: false }).limit(6);
    setRows((data as CycleRow[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = rows.find((r) => r.end_date === null);

  async function start() {
    setError(null);
    const { error } = await supabase.from("cycles").upsert({ start_date: date }, { onConflict: "owner_id,start_date" });
    if (error) return setError(SAVE_ERROR);
    onSaved();
    load();
  }

  async function end() {
    if (!open) return;
    setError(null);
    if (date < open.start_date) return setError("終わった日は、始まった日より後にしてね。");
    const { error } = await supabase.from("cycles").update({ end_date: date }).eq("id", open.id);
    if (error) return setError(SAVE_ERROR);
    onSaved();
    load();
  }

  async function remove(id: number) {
    if (!confirm("この記録を消しますか？")) return;
    await supabase.from("cycles").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <label className="label">日付</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {open ? (
          <>
            <p className="text-sm text-nasu-600">{formatMD(open.start_date)} から生理中として記録しています。</p>
            <button className="btn-primary w-full" onClick={end}>
              この日に終わった
            </button>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={start}>
            この日に始まった
          </button>
        )}
        <ErrorNote error={error} />
      </div>

      {rows.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-nasu-600">これまでの記録</h2>
          <ul className="divide-y divide-nasu-50 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center py-2">
                <span className="flex-1">
                  {formatMD(r.start_date)} 〜 {r.end_date ? formatMD(r.end_date) : "（記録中）"}
                </span>
                <button aria-label="削除" className="px-2 text-nasu-300" onClick={() => remove(r.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
