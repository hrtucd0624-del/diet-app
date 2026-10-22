"use client";

import { useEffect } from "react";
import { today } from "@/lib/date";

// ホーム画面アプリは閉じずに裏で残るので、日付が変わってから開くと「昨日」のままになる。
// 開き直した時・1分ごとに日付を確かめ、変わっていたら読み込み直す
export function DayChangeReload() {
  useEffect(() => {
    const opened = today();
    const check = () => {
      if (document.visibilityState === "visible" && today() !== opened) location.reload();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, []);
  return null;
}
