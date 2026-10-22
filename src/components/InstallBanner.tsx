"use client";

import { useEffect, useState } from "react";
import { isIOS, isStandalone } from "@/lib/pwa";
import { AddToHomeGuide } from "./AddToHomeGuide";

const KEY = "install-banner-dismissed";

// Safari で開いている時だけ「ホーム画面に追加」を案内する（通知にはこれが必要）
export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {}
    setShow(isIOS() && !isStandalone() && !dismissed);
  }, []);

  if (!show) return null;
  return (
    <div className="card mb-4 bg-sun-100 ring-sun-100">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm">ホーム画面に追加すると、アプリみたいに使えて通知も届くよ。</p>
        <button
          aria-label="閉じる"
          className="text-nasu-400"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
            setShow(false);
          }}
        >
          ✕
        </button>
      </div>
      {open ? (
        <div className="mt-3">
          <AddToHomeGuide />
        </div>
      ) : (
        <button className="mt-2 text-sm font-semibold text-nasu-600 underline" onClick={() => setOpen(true)}>
          やり方を見る
        </button>
      )}
    </div>
  );
}
