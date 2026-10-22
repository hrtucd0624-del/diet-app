// AIコーチ（Supabase Edge Function "coach"）
// このファイルを直したら `node scripts/build-coach.mjs` で index.ts を作り直し、
// index.ts の中身を Supabase の管理画面（Edge Functions → coach）に貼って Deploy する。
//
// 必要な Secrets（Edge Functions → Secrets）：
//   GEMINI_API_KEY … Google AI Studio で作ったキー
//   GEMINI_MODEL   … 例 gemini-3.8-flash（無料枠の対象モデルは変わるので、ここで切り替える）
// あると便利な Secrets：
//   GEMINI_FALLBACK_MODEL … 混んでいる時に使う予備のモデル（例 gemini-3.5-flash-lite。無料枠はモデルごと）
//   GEMINI_THINKING       … 考える量 low / medium / high（初期値 low。"off" で指定しない）
//
// action:
//   reply          … 直近のチャットに返事をして chat_messages に保存
//   analyze_meal   … 食事の写真を分析して meals.ai_analysis に保存
//   suggest_todos  … 今日やることを提案（todos に source='coach' で追加）

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const COACH_PROMPT: string = "__COACH_PROMPT__";

const HISTORY_MESSAGES = 40; // 20往復
const DAILY_AI_LIMIT = 120; // 無料枠を守るための1日の上限（チャット・写真分析・提案の合計）
const SUGGEST_TODOS = 3; // 1回の提案で増やす数（今日やることの数に上限はない）

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const BUSY_MESSAGE = "今AIが混んでいるので、数分後にもう一度送ってね。記録はちゃんと保存されてるよ";
const DAILY_MESSAGE = "今日のAIの無料枠を使い切ったみたい。続きはまた明日ね。記録はちゃんと保存されてるよ";
const FAILED_MESSAGE = "うまく返事ができませんでした。少し時間をおいてもう一度送ってね。記録はちゃんと保存されてるよ";

type Req = {
  action: "reply" | "analyze_meal" | "suggest_todos";
  today: string; // 端末の日付 YYYY-MM-DD
  now: string; // 端末の日時（表示用）例 "2026/10/23(木) 19:30"
  tz_offset: number; // UTCからの分（日本なら 540）
  meal_id?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "auth" }, 401);

  // ログイン中の本人として DB を読む（RLS が効く）
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: profile } = await sb.from("profiles").select("*").single();
  if (!profile) return json({ error: "auth" }, 401);
  if (profile.role !== "owner" || !profile.consent_ai) return json({ error: "consent" }, 403);

  let body: Req;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.today ?? "")) return json({ error: "bad_request" }, 400);
  body.tz_offset = Number.isFinite(body.tz_offset) ? body.tz_offset : 0;

  if (!["reply", "analyze_meal", "suggest_todos"].includes(body.action)) return json({ error: "bad_request" }, 400);

  // 1日の上限（24時間で数える）。数えてから AI を呼ぶ
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from("ai_calls").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= DAILY_AI_LIMIT) {
    return json({ error: "limit", message: "今日はたくさん話したね。続きはまた明日にしよう。記録はいつでもできるよ" }, 429);
  }
  await sb.from("ai_calls").insert({ action: body.action });

  try {
    if (body.action === "reply") return await reply(sb, profile, body);
    if (body.action === "analyze_meal") return await analyzeMeal(sb, body);
    if (body.action === "suggest_todos") return await suggestTodos(sb, profile, body);
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    if (e instanceof GeminiBusy) return json({ error: "busy", message: BUSY_MESSAGE }, 429);
    if (e instanceof GeminiDailyLimit) return json({ error: "daily", message: DAILY_MESSAGE }, 429);
    console.error(e);
    return json({ error: "failed", message: FAILED_MESSAGE }, 500);
  }
});

// ------------------------------------------------------------ Gemini

class GeminiBusy extends Error {}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
type Content = { role: "user" | "model"; parts: Part[] };

class GeminiDailyLimit extends Error {}

const MAX_RETRY_WAIT_MS = 5000; // これより長く待てと言われたら、待たずに次へ
const REQUEST_TIMEOUT_MS = 45000;

// 429 の本文から「何秒後に再試行」と「1日の上限か」を読む
function readRateLimit(body: string): { retryMs: number; daily: boolean } {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  const daily = /PerDay|per day|RequestsPerDay/i.test(body);
  return { retryMs: m ? Number(m[1]) * 1000 : 3000, daily };
}

async function callModel(
  key: string,
  model: string,
  system: string,
  contents: Content[],
  generationConfig: Record<string, unknown> | undefined,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  // 考える量を少なめにして返事を速くする（GEMINI_THINKING で変更可。"off" で送らない）
  const thinking = Deno.env.get("GEMINI_THINKING") ?? "low";
  const config = {
    ...(generationConfig ?? {}),
    ...(thinking !== "off" ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
  };
  const send = (cfg: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        ...(Object.keys(cfg).length ? { generationConfig: cfg } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let res = await send(config);
  // thinkingLevel に対応していないモデルなら、外してもう一度
  if (res.status === 400 && thinking !== "off") {
    const body = await res.text();
    if (!/thinking/i.test(body)) return { ok: false, status: 400, body };
    res = await send(generationConfig ?? {});
  }
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string; thought?: boolean }) => (p.thought ? "" : p.text ?? ""))
    .join("")
    .trim();
  if (!text) throw new Error(`Gemini empty: ${JSON.stringify(data).slice(0, 500)}`);
  return { ok: true, text };
}

async function gemini(system: string, contents: Content[], generationConfig?: Record<string, unknown>) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const primary = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const fallback = Deno.env.get("GEMINI_FALLBACK_MODEL");

  let allDaily = true;
  for (const model of fallback && fallback !== primary ? [primary, fallback] : [primary]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await callModel(key, model, system, contents, generationConfig);
      if (r.ok) return r.text;
      if (r.status !== 429 && r.status !== 503) throw new Error(`Gemini ${model} ${r.status}: ${r.body.slice(0, 1000)}`);

      const { retryMs, daily } = r.status === 429 ? readRateLimit(r.body) : { retryMs: 3000, daily: false };
      console.error(`Gemini ${model} ${r.status} (daily=${daily}, retry=${retryMs}ms): ${r.body.slice(0, 600)}`);
      if (!daily) allDaily = false;
      // 1日の上限、または長く待つ必要がある時は、待たずに予備のモデルへ
      if (attempt === 0 && !daily && retryMs <= MAX_RETRY_WAIT_MS) {
        await new Promise((res) => setTimeout(res, retryMs));
        continue;
      }
      break;
    }
  }
  if (allDaily) throw new GeminiDailyLimit();
  throw new GeminiBusy();
}

async function photoPart(sb: SupabaseClient, path: string): Promise<Part | null> {
  const { data } = await sb.storage.from("meal-photos").download(path);
  if (!data) return null;
  return { inline_data: { mime_type: "image/jpeg", data: encodeBase64(new Uint8Array(await data.arrayBuffer())) } };
}

// ------------------------------------------------------------ 今日の状況

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 週は月曜はじまり
function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

function localHM(ts: string, offset: number) {
  const d = new Date(Date.parse(ts) + offset * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function md(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function avg(rows: { weight_kg: number }[]) {
  if (!rows.length) return null;
  return (rows.reduce((s, r) => s + Number(r.weight_kg), 0) / rows.length).toFixed(1);
}

const LEVEL: Record<string, string> = { good: "いい", "so-so": "ふつう", bad: "よくない" };
const KIND: Record<string, string> = { work: "バイト", pilates: "ピラティス", other: "予定" };

type Analysis = {
  carbs: string;
  fat: string;
  protein: string;
  vegetables: string;
  processed_food: boolean;
  gut_friendly: string;
  volume?: string;
  comment: string;
};
const LMH: Record<string, string> = { low: "少なめ", mid: "ふつう", high: "多め" };

function analysisText(a: Analysis | null) {
  if (!a) return "";
  return `（写真分析：糖質${LMH[a.carbs] ?? "-"}・脂質${LMH[a.fat] ?? "-"}・たんぱく質${LMH[a.protein] ?? "-"}・野菜${
    LMH[a.vegetables] ?? "-"
  }${a.processed_food ? "・加工品あり" : ""}・腸にうれしい要素${a.gut_friendly === "more" ? "多め" : "少なめ"}）`;
}

async function buildContext(sb: SupabaseClient, profile: Record<string, unknown>, body: Req) {
  const { today, tz_offset } = body;
  const dayStart = new Date(Date.parse(`${today}T00:00:00Z`) - tz_offset * 60000).toISOString();
  const dayEnd = new Date(Date.parse(`${addDays(today, 1)}T00:00:00Z`) - tz_offset * 60000).toISOString();

  const [weights, meals, exercises, todos, condition, schedules, event, streak, phase, reward] = await Promise.all([
    sb.from("weights").select("date, weight_kg").gte("date", addDays(today, -13)).lte("date", today),
    sb.from("meals").select("eaten_at, note, ai_analysis, asked_before").eq("date", today).order("eaten_at"),
    sb.from("exercises").select("kind, minutes").eq("date", today),
    sb.from("todos").select("text, done").eq("date", today).order("id"),
    sb.from("conditions").select("*").eq("date", today).maybeSingle(),
    sb.from("schedules").select("*").gte("starts_at", dayStart).lt("starts_at", dayEnd).order("starts_at"),
    sb.from("events").select("date, title").gte("date", today).order("date").limit(1).maybeSingle(),
    sb.rpc("record_streak", { p_today: today }),
    sb.rpc("cycle_phase", { p_today: today }),
    sb.from("rewards").select("*").eq("week_start", mondayOf(today)).maybeSingle(),
  ]);

  const w = (weights.data ?? []) as { date: string; weight_kg: number }[];
  const wToday = w.find((r) => r.date === today);
  const thisWeek = w.filter((r) => r.date > addDays(today, -7));
  const lastWeek = w.filter((r) => r.date <= addDays(today, -7));

  const c = condition.data as Record<string, unknown> | null;
  const conditionText = c
    ? [
        c.fever_c ? `熱${c.fever_c}℃` : "",
        c.stomach ? `お腹：${LEVEL[c.stomach as string]}` : "",
        c.fatigue ? `だるさ：${LEVEL[c.fatigue as string]}` : "",
        c.note ? `メモ：${c.note}` : "",
      ]
        .filter(Boolean)
        .join("、")
    : "";

  let rewardText = "未設定";
  let rewardLeft = "-";
  if (reward.data) {
    const r = reward.data as { title: string; required_days: number; achieved_at: string | null };
    const { data: done } = await sb.rpc("week_days_done", { p_today: today });
    rewardText = r.achieved_at ? `${r.title}（今週は達成ずみ）` : r.title;
    rewardLeft = String(Math.max(0, r.required_days - Number(done ?? 0)));
  }

  const ev = event.data as { date: string; title: string } | null;
  const daysLeft = ev ? Math.round((Date.parse(ev.date) - Date.parse(today)) / 86400000) : null;

  const values: Record<string, string> = {
    nickname: String(profile.nickname),
    now: body.now,
    today_schedule:
      (schedules.data ?? [])
        .map(
          (s: { kind: string; title: string | null; starts_at: string; ends_at: string }) =>
            `${s.title || KIND[s.kind] || "予定"} ${localHM(s.starts_at, tz_offset)}-${localHM(s.ends_at, tz_offset)}`,
        )
        .join("、") || "なし",
    next_event: ev ? `${md(ev.date)} ${ev.title}` : "なし",
    days_left: daysLeft === null ? "-" : String(daysLeft),
    weight_today: wToday ? Number(wToday.weight_kg).toFixed(1) : "未記録",
    weight_7day_avg: avg(thisWeek) ?? "記録なし",
    weight_prev_7day_avg: avg(lastWeek) ?? "記録なし",
    cycle_phase: (phase.data as string | null) ?? "未登録",
    meals_today:
      (meals.data ?? [])
        .map(
          (m: { eaten_at: string; note: string | null; ai_analysis: Analysis | null; asked_before: boolean }) =>
            `${localHM(m.eaten_at, tz_offset)} ${m.note || "（写真のみ）"}${analysisText(m.ai_analysis)}${
              m.asked_before ? "［食べる前に相談できた］" : ""
            }`,
        )
        .join(" ／ ") || "まだ記録なし",
    exercise_today:
      (exercises.data ?? [])
        .map((e: { kind: string; minutes: number | null }) => `${e.kind}${e.minutes ? ` ${e.minutes}分` : ""}`)
        .join("、") || "まだ記録なし",
    todo_today:
      (todos.data ?? []).map((t: { text: string; done: boolean }) => `${t.text}（${t.done ? "完了" : "未完了"}）`).join("、") ||
      "まだ決めていない",
    streak_days: String(streak.data ?? 0),
    weekly_reward: rewardText,
    reward_days_left: rewardLeft,
    condition: conditionText || "特になし",
    partner_message: "なし",
  };
  return values;
}

function systemPrompt(profile: Record<string, unknown>, values: Record<string, string>) {
  const filled = COACH_PROMPT.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => values[k] ?? "不明");
  // アプリのプロフィール（3章より優先）とパートナーの応援
  const appProfile = [
    "## アプリのプロフィール（3章の初期プロフィールより優先）",
    `- ニックネーム：${profile.nickname}`,
    `- 身長：${profile.height_cm ? `${profile.height_cm}cm` : "未設定"}`,
    `- 目標体重：${profile.target_weight_kg ? `${profile.target_weight_kg}kg` : "未設定"}（46kg未満にはしない）`,
    `- 体質メモ：${profile.body_notes || "なし"}`,
    "",
    `パートナーからの応援：${values.partner_message}`,
  ].join("\n");
  return `${filled}\n\n---\n\n${appProfile}`;
}

// ------------------------------------------------------------ reply

async function reply(sb: SupabaseClient, profile: Record<string, unknown>, body: Req) {
  const { data: rows } = await sb
    .from("chat_messages")
    .select("role, text, photo_path")
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  const history = ((rows ?? []) as { role: string; text: string; photo_path: string | null }[]).reverse();
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length || history[history.length - 1].role !== "user") return json({ error: "bad_request" }, 400);

  // 同じ役の発言が続く時はまとめる。写真は最新のメッセージのものだけ送る
  const contents: Content[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    const role = m.role === "coach" ? "model" : "user";
    const parts: Part[] = [{ text: m.text || "（写真）" }];
    if (m.photo_path) {
      const isLast = i === history.length - 1;
      const p = isLast ? await photoPart(sb, m.photo_path) : null;
      parts.push(p ?? { text: "［料理の写真］" });
    }
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts);
    else contents.push({ role, parts });
  }

  const values = await buildContext(sb, profile, body);
  const text = await gemini(systemPrompt(profile, values), contents);

  const { error } = await sb.from("chat_messages").insert({ role: "coach", text });
  if (error) throw error;
  return json({ reply: text });
}

// ------------------------------------------------------------ analyze_meal

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    carbs: { type: "STRING", enum: ["low", "mid", "high"] },
    fat: { type: "STRING", enum: ["low", "mid", "high"] },
    protein: { type: "STRING", enum: ["low", "mid", "high"] },
    vegetables: { type: "STRING", enum: ["low", "mid", "high"] },
    processed_food: { type: "BOOLEAN" },
    gut_friendly: { type: "STRING", enum: ["more", "less"] },
    volume: { type: "STRING", enum: ["light", "normal", "hearty"] },
    comment: { type: "STRING" },
  },
  required: ["carbs", "fat", "protein", "vegetables", "processed_food", "gut_friendly", "volume", "comment"],
};

async function analyzeMeal(sb: SupabaseClient, body: Req) {
  const { data: meal } = await sb
    .from("meals")
    .select("id, note, photo_path, photo_ai_ok")
    .eq("id", body.meal_id ?? -1)
    .single();
  if (!meal?.photo_path || !meal.photo_ai_ok) return json({ error: "bad_request" }, 400);

  const image = await photoPart(sb, meal.photo_path);
  if (!image) return json({ error: "failed", message: FAILED_MESSAGE }, 500);

  const system = [
    "あなたは食事の写真から、栄養バランスの傾向だけを推定するアシスタントです。",
    "カロリーの数字は出さない。量は light（軽め）/ normal（ふつう）/ hearty（しっかり）の3段階だけ。",
    "腸内環境や肌の状態は断定しない。gut_friendly は食物繊維・発酵食品が多めなら more。",
    "comment は日本語で40文字以内の一言。責める言い方をしない。「食べすぎ」「失敗」と言わない。",
    "人の顔や体が写っていても、それについては何も書かない。",
  ].join("\n");
  const text = await gemini(
    system,
    [{ role: "user", parts: [{ text: `メモ：${meal.note || "なし"}` }, image] }],
    { responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA },
  );
  const analysis = JSON.parse(text) as Analysis;
  await sb.from("meals").update({ ai_analysis: analysis }).eq("id", meal.id);
  return json({ analysis });
}

// ------------------------------------------------------------ suggest_todos

async function suggestTodos(sb: SupabaseClient, profile: Record<string, unknown>, body: Req) {
  const { data: existing } = await sb.from("todos").select("text").eq("date", body.today);
  const already = (existing ?? []).map((t: { text: string }) => t.text);

  const values = await buildContext(sb, profile, body);
  const instruction = [
    `今日やることを${SUGGEST_TODOS}つ提案してください（1つ30文字以内、具体的で今日中にできること）。`,
    already.length ? `すでに決めていること（これと同じものは出さない）：${already.join("、")}` : "",
    "体調がよくない日は「休む」「温かいものを飲む」など休養のことだけにする。",
    "あわせて、ホームに出す今日の一言（60文字以内）を書いてください。",
  ]
    .filter(Boolean)
    .join("\n");
  const text = await gemini(
    systemPrompt(profile, values),
    [{ role: "user", parts: [{ text: instruction }] }],
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          comment: { type: "STRING" },
          todos: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["comment", "todos"],
      },
    },
  );
  const parsed = JSON.parse(text) as { comment: string; todos: string[] };
  const todos = (parsed.todos ?? [])
    .map((t) => String(t).trim().slice(0, 60))
    .filter((t) => t && !already.includes(t))
    .slice(0, SUGGEST_TODOS);
  if (todos.length) {
    await sb.from("todos").insert(todos.map((t) => ({ date: body.today, text: t, source: "coach" })));
  }
  return json({ comment: String(parsed.comment ?? "").slice(0, 120), added: todos.length });
}
