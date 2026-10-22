import { createClient } from "@/lib/supabase/client";

// 通知用の公開鍵（公開してよい値）。秘密鍵は Supabase の Secrets にだけある
export const VAPID_PUBLIC_KEY = "BE84KqLEKh9iSylpAm4BBZgHBVyNUboWmAxj2Y7GavVFbGMTeQC4Lhl4YGWE0Mu6d4s-FrgG2LKpNDo4F51Vkko";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// 通知をオンにする（許可をたずねて、この端末を登録する）
export async function enablePush(userId: string): Promise<"ok" | "denied" | "unsupported" | "error"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
    const json = sub.toJSON();
    const supabase = createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: userId, endpoint: sub.endpoint, keys: json.keys }, { onConflict: "endpoint" });
    if (error) return "error";
    await supabase.from("profiles").update({ timezone: deviceTimeZone() }).eq("id", userId);
    return "ok";
  } catch {
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestPush(): Promise<boolean> {
  const { data, error } = await createClient().functions.invoke("send-push", { body: { test: true } });
  return !error && (data?.sent ?? 0) > 0;
}
