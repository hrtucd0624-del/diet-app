"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Ctx = { profile: Profile; reload: () => Promise<void> };
const ProfileContext = createContext<Ctx | null>(null);

export function useProfile(): Ctx {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

// プロフィールを読み込み、初回設定がまだなら初回設定へ送る
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("*").single();
    if (error || !data) {
      setFailed(true);
      return;
    }
    setProfile(data as Profile);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!profile) return;
    if (!profile.onboarded_at) {
      if (pathname !== "/onboarding") router.replace("/onboarding");
    } else if (!profile.consent_decided_at && pathname !== "/consent") {
      // フェーズ1から使っている人にも、一度だけ同意画面を出す
      router.replace("/consent");
    }
  }, [profile, pathname, router]);

  if (failed) {
    return (
      <div className="p-8 text-center text-sm">
        読み込めませんでした。電波のいいところで開きなおしてね。
        <button className="btn-soft mt-4 w-full" onClick={() => location.reload()}>
          もう一度読み込む
        </button>
      </div>
    );
  }
  if (!profile) {
    return <div className="p-8 text-center text-sm text-nasu-500">読み込み中…</div>;
  }
  return <ProfileContext.Provider value={{ profile, reload }}>{children}</ProfileContext.Provider>;
}
