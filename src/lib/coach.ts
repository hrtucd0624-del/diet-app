import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/date";

export type CoachAction = "reply" | "analyze_meal" | "suggest_todos";

export type CoachResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const FALLBACK = "うまくつながりませんでした。少し時間をおいてもう一度ためしてね。記録はちゃんと保存されてるよ";

function nowLabel(): string {
  const d = new Date();
  const w = "日月火水木金土"[d.getDay()];
  return `${today().replaceAll("-", "/")}(${w}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Edge Function "coach" を呼ぶ。Gemini のキーはサーバー側にだけある
export async function callCoach<T>(action: CoachAction, extra: Record<string, unknown> = {}): Promise<CoachResult<T>> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("coach", {
    body: { action, today: today(), now: nowLabel(), tz_offset: -new Date().getTimezoneOffset(), ...extra },
  });
  if (!error) return { ok: true, data: data as T };
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error === "consent") {
        return { ok: false, code: "consent", message: "AIコーチがオフになっています。設定からオンにできます。" };
      }
      return { ok: false, code: body?.error ?? "failed", message: body?.message ?? FALLBACK };
    } catch {}
  }
  return { ok: false, code: "network", message: FALLBACK };
}
