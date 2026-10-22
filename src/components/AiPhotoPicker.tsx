"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CropScreen } from "./CropScreen";
import { loadBitmap, renderJpeg, type Rect } from "@/lib/image";
import { checkPhoto, preloadPhotoGuard } from "@/lib/guard/photo";

export type PickedPhoto = {
  blob: Blob; // 切り抜き・縮小・EXIF削除ずみ
  url: string; // プレビュー用
  aiOk: boolean; // 送信前チェックを通ったか
  reasons: string[]; // 通らなかった理由
};

// 写真を選ぶ → 切り抜き画面（必ず通る）→ 縮小・EXIF削除 → 顔・人のチェック
export function AiPhotoPicker({
  onPicked,
  className,
  children,
}: {
  onPicked: (p: PickedPhoto) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    preloadPhotoGuard();
    try {
      setBitmap(await loadBitmap(file));
    } catch {
      setError("写真を読み込めませんでした。別の写真でためしてね。");
    }
  }

  async function done(rect: Rect) {
    if (!bitmap) return;
    setChecking(true);
    try {
      const blob = await renderJpeg(bitmap, rect);
      const result = await checkPhoto(blob);
      onPicked({ blob, url: URL.createObjectURL(blob), aiOk: result.level === "ok", reasons: result.reasons });
    } catch {
      setError("写真を処理できませんでした。もう一度ためしてね。");
    } finally {
      bitmap.close();
      setBitmap(null);
      setChecking(false);
    }
  }

  return (
    <>
      <label className={className}>
        {children}
        <input type="file" accept="image/*" className="hidden" onChange={pick} />
      </label>
      {error && <p className="mt-2 rounded-xl bg-sun-100 p-3 text-sm">{error}</p>}
      {/* 画面いちばん外側に出す（下に貼りつく入力欄やメニューに隠れないように） */}
      {bitmap &&
        !checking &&
        createPortal(
          <CropScreen
            bitmap={bitmap}
            onCancel={() => {
              bitmap.close();
              setBitmap(null);
            }}
            onDone={done}
          />,
          document.body,
        )}
      {checking &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-nasu-700/90 p-6 text-center text-white">
            <p>写真をチェックしています…（端末の中だけで調べています）</p>
          </div>,
          document.body,
        )}
    </>
  );
}
