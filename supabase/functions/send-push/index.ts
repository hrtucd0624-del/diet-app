// 通知を送る（Supabase Edge Function "send-push"）
// pg_cron が5分ごとに呼ぶ。通知文はテンプレートから作り、AIは呼ばない（無料枠を節約するため）。
//
// Supabase の管理画面で作る時：「Verify JWT」は【オフ】にする（cron は JWT を持っていないため。
// 代わりに Vault の合言葉と、テスト通知ではログイン中の本人であることを自分で確かめる）。
//
// 必要な Secrets：
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY … 通知用の鍵
//   VAPID_SUBJECT … 例 https://diet-app-v8vf.vercel.app

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const WINDOW_MIN = 120; // 予定の時刻から2時間以内なら送る（cron が遅れても届くように）
const WORK_END_WINDOW_MIN = 30;

// バイト終わりのひとこと（コーチの定型文）
const AFTER_WORK_FOODS = ["ゆで卵", "具だくさんのお味噌汁", "温かいお茶とゆで卵", "小さめの玄米おにぎり", "白湯とゆで卵"];

type Profile = {
  id: string;
  role: string;
  nickname: string;
  notify_morning: string;
  notify_evening: string;
  notify_work_end: boolean;
  timezone: string;
};
type Sub = { id: number; user_id: string; endpoint: string; keys: { p256dh: string; auth: string } };
type Message = { title: string; body: string; url: string; tag: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    // 貼り付けた時の空白・改行は取りのぞく
    webpush.setVapidDetails(
      (Deno.env.get("VAPID_SUBJECT") ?? "").trim(),
      (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim(),
      (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim(),
    );
  } catch (e) {
    // 鍵の値そのものは出さず、どこがおかしいかだけ返す
    const message = e instanceof Error ? e.message : String(e);
    console.error("VAPID setup failed:", message);
    return json({ error: "vapid", message }, 500);
  }

  // 1) 設定画面から（ログイン中の本人）：テスト通知、または通知の状態確認
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret) {
    if (!auth) return json({ error: "auth" }, 401);
    const { data: u } = await admin.auth.getUser(auth);
    if (!u.user) return json({ error: "auth" }, 401);
    let body: { status?: boolean } = {};
    try {
      body = await req.json();
    } catch {}
    if (body.status) return json(await statusFor(admin, u.user.id));
    const sent = await sendToUser(admin, u.user.id, {
      title: "なすびコーチ",
      body: "通知のテストだよ。ちゃんと届いてる！",
      url: "/",
      tag: "test",
    });
    return json({ sent });
  }

  // 2) cron から：合言葉を確かめる
  const { data: ok } = await admin.rpc("check_push_cron_secret", { p_secret: cronSecret });
  if (ok !== true) return json({ error: "auth" }, 401);

  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = [...new Set((subs ?? []).map((s: { user_id: string }) => s.user_id))];
  if (!userIds.length) {
    await admin.from("push_status").upsert({ id: 1, last_run_at: new Date().toISOString(), last_result: { users: 0, sent: 0 } });
    return json({ users: 0, sent: 0 });
  }

  const { data: profiles } = await admin.from("profiles").select("*").in("id", userIds).eq("role", "owner");
  let sent = 0;
  for (const p of (profiles ?? []) as Profile[]) {
    for (const due of await dueMessages(admin, p)) {
      // 先に記録して、同じ通知を2回送らない
      const { data: logged } = await admin
        .from("push_log")
        .upsert({ user_id: p.id, kind: due.kind, ref: due.ref }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true })
        .select("id");
      if (!logged?.length) continue;
      sent += await sendToUser(admin, p.id, due.message);
    }
  }
  await admin
    .from("push_status")
    .upsert({ id: 1, last_run_at: new Date().toISOString(), last_result: { users: userIds.length, sent } });
  return json({ users: userIds.length, sent });
});

// 設定画面の「通知の状態を確認」用
async function statusFor(admin: SupabaseClient, userId: string) {
  const [{ data: p }, { data: subs }, { data: st }, { data: logs }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).single(),
    admin.from("push_subscriptions").select("endpoint").eq("user_id", userId),
    admin.from("push_status").select("*").eq("id", 1).maybeSingle(),
    admin.from("push_log").select("kind, ref, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  const prof = p as Profile | null;
  const local = prof ? localNow(prof.timezone) : null;
  return {
    timezone: prof?.timezone ?? null,
    local_date: local?.date ?? null,
    local_time: local ? `${String(Math.floor(local.minutes / 60)).padStart(2, "0")}:${String(local.minutes % 60).padStart(2, "0")}` : null,
    morning: prof?.notify_morning?.slice(0, 5) ?? null,
    evening: prof?.notify_evening?.slice(0, 5) ?? null,
    work_end: prof?.notify_work_end ?? null,
    devices: (subs ?? []).length,
    devices_ok: (subs ?? []).filter((s: { endpoint: string }) => isPushEndpoint(s.endpoint)).length,
    cron_last_run: st?.last_run_at ?? null,
    cron_last_result: st?.last_result ?? null,
    recent: logs ?? [],
  };
}

// 端末のタイムゾーンでの「今日の日付」と「今の分（0時からの分）」
function localNow(tz: string): { date: string; minutes: number } {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((x) => [x.type, x.value]),
    );
  } catch {
    return localNow("UTC");
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function inWindow(now: number, target: number) {
  return now >= target && now < target + WINDOW_MIN;
}

async function dueMessages(admin: SupabaseClient, p: Profile) {
  const { date, minutes } = localNow(p.timezone);
  const due: { kind: string; ref: string; message: Message }[] = [];

  if (inWindow(minutes, toMinutes(p.notify_morning))) {
    due.push({
      kind: "morning",
      ref: date,
      message: { title: "なすびコーチ", body: "おはよう。体重と今日やることを決めよう", url: "/", tag: "morning" },
    });
  }
  if (inWindow(minutes, toMinutes(p.notify_evening))) {
    due.push({
      kind: "evening",
      ref: date,
      message: { title: "なすびコーチ", body: "今日の振り返りをしよう", url: "/chat?topic=evening", tag: "evening" },
    });
  }
  if (p.notify_work_end) {
    const now = Date.now();
    const { data: works } = await admin
      .from("schedules")
      .select("id")
      .eq("owner_id", p.id)
      .eq("kind", "work")
      .lte("ends_at", new Date(now).toISOString())
      .gt("ends_at", new Date(now - WORK_END_WINDOW_MIN * 60000).toISOString());
    for (const w of works ?? []) {
      const food = AFTER_WORK_FOODS[Number(w.id) % AFTER_WORK_FOODS.length];
      due.push({
        kind: "work_end",
        ref: String(w.id),
        message: {
          title: "お疲れさま",
          body: `今いちばん甘いものが欲しくなる時間。帰ったら最初に${food}を食べよう`,
          url: "/chat",
          tag: "work_end",
        },
      });
    }
  }
  return due;
}

// 通知の送り先は、ブラウザの公式の通知サービスだけ（それ以外のURLには送らない）
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.notify\.windows\.com$/, /\.push\.services\.mozilla\.com$/];

function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

async function sendToUser(admin: SupabaseClient, userId: string, message: Message): Promise<number> {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  let sent = 0;
  for (const s of (subs ?? []) as Sub[]) {
    if (!isPushEndpoint(s.endpoint)) {
      console.error("unknown push endpoint host, removed");
      await admin.from("push_subscriptions").delete().eq("id", s.id);
      continue;
    }
    try {
      // web-push で暗号化と署名だけ作り、送信は fetch で行う
      const d = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(message), {
        TTL: 60 * 60 * 6,
        urgency: "normal",
      });
      const res = await fetch(d.endpoint, { method: d.method, headers: d.headers, body: d.body });
      if (res.status === 404 || res.status === 410) {
        // 使われなくなった端末の登録は消す
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      } else if (res.ok) {
        sent++;
      } else {
        console.error(`push ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
    } catch (e) {
      console.error("push failed", e);
    }
  }
  return sent;
}
