"use client";

import { useEffect, useRef, useState } from "react";
import type { Rect } from "@/lib/image";

type Drag = { mode: "move" | "resize"; startX: number; startY: number; start: Rect };

// 料理の部分だけを切り抜く画面。枠をドラッグで動かし、右下の丸で大きさを変える
export function CropScreen({
  bitmap,
  onCancel,
  onDone,
}: {
  bitmap: ImageBitmap;
  onCancel: () => void;
  onDone: (rect: Rect) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1); // 画像1pxが画面で何pxか
  const [rect, setRect] = useState<Rect>(() => {
    const w = bitmap.width * 0.8;
    const h = bitmap.height * 0.8;
    return { x: (bitmap.width - w) / 2, y: (bitmap.height - h) / 2, w, h };
  });
  const drag = useRef<Drag | null>(null);

  // 画面の大きさに合わせて画像を描く（回転などで大きさが変わったら描き直す）
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const draw = () => {
      const s = Math.min(wrap.clientWidth / bitmap.width, wrap.clientHeight / bitmap.height);
      setScale(s);
      canvas.width = Math.round(bitmap.width * s);
      canvas.height = Math.round(bitmap.height * s);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [bitmap]);

  const minSide = Math.min(bitmap.width, bitmap.height) * 0.15;

  function onPointerDown(e: React.PointerEvent, mode: Drag["mode"]) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (d.mode === "move") {
      setRect({
        ...d.start,
        x: Math.min(Math.max(0, d.start.x + dx), bitmap.width - d.start.w),
        y: Math.min(Math.max(0, d.start.y + dy), bitmap.height - d.start.h),
      });
    } else {
      setRect({
        ...d.start,
        w: Math.min(Math.max(minSide, d.start.w + dx), bitmap.width - d.start.x),
        h: Math.min(Math.max(minSide, d.start.h + dy), bitmap.height - d.start.y),
      });
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-50 flex flex-col bg-nasu-700/95 text-white">
      <div className="px-4 py-3">
        <p className="font-bold">料理の部分だけを囲んでね</p>
        <p className="text-xs text-nasu-100">人・顔・名前・レシートなどが入らないように。枠は動かせて、右下の丸で大きさを変えられます。</p>
      </div>
      <div ref={wrapRef} className="relative mx-4 flex flex-1 items-center justify-center overflow-hidden">
        <div className="relative" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <canvas ref={canvasRef} className="block" />
          {/* 枠の外を暗くする */}
          <div
            className="absolute touch-none border-2 border-white"
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.w * scale,
              height: rect.h * scale,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            }}
            onPointerDown={(e) => onPointerDown(e, "move")}
          >
            <div
              className="absolute -bottom-4 -right-4 h-8 w-8 touch-none rounded-full border-2 border-nasu-500 bg-white"
              onPointerDown={(e) => onPointerDown(e, "resize")}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-3 p-4">
        <button className="btn flex-1 bg-white/15 text-white" onClick={onCancel}>
          やめる
        </button>
        <button className="btn flex-[2] bg-white text-nasu-700" onClick={() => onDone(rect)}>
          この範囲で決定
        </button>
      </div>
    </div>
  );
}
