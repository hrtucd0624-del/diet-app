// 写真は端末の中で処理する：向きをそろえて読み込み → 切り抜き → 長辺1024px以下に縮小 →
// Canvas で描き直して JPEG にする（このとき EXIF の位置情報・撮影日時は消える）

export type Rect = { x: number; y: number; w: number; h: number };

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function renderJpeg(
  bitmap: ImageBitmap,
  rect: Rect = { x: 0, y: 0, w: bitmap.width, h: bitmap.height },
  maxSide = 1024,
  quality = 0.82,
): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(rect.w, rect.h));
  const w = Math.max(1, Math.round(rect.w * scale));
  const h = Math.max(1, Math.round(rect.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像の変換に失敗しました"))), "image/jpeg", quality),
  );
}

// 切り抜きなしで縮小だけする（記録として保存するだけの写真用）
export async function shrinkImage(file: File, maxSide = 1024): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  try {
    return await renderJpeg(bitmap, undefined, maxSide);
  } finally {
    bitmap.close();
  }
}
