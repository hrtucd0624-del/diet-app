import { createBrowserClient } from "@supabase/ssr";

// 公開してよい値（anon key）だけを使う。RLS でデータを守る
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
