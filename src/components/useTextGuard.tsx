"use client";

import { useCallback, useRef, useState } from "react";
import { checkText, type TextGuardResult } from "@/lib/guard/text";
import { loadDictionary } from "@/lib/guard/dictionary";

type Pending = { result: TextGuardResult; resolve: (text: string | null) => void };

// AIに渡る文章を送る前にチェックする。
//   ok で伏せ字なし → そのまま
//   伏せ字あり／確認 → 置き換え後の文を見せて、本人が選ぶ
//   ブロック → 理由を見せて、送らない
export function useTextGuard() {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const guard = useCallback((text: string): Promise<string | null> => {
    const result = checkText(text, loadDictionary());
    if (result.level === "ok" && result.masked === 0) return Promise.resolve(result.text);
    return new Promise((resolve) => {
      const p = { result, resolve };
      pendingRef.current = p;
      setPending(p);
    });
  }, []);

  function close(text: string | null) {
    pendingRef.current?.resolve(text);
    pendingRef.current = null;
    setPending(null);
  }

  const modal = pending ? (
    <div className="pb-safe fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="card w-full max-w-md space-y-3">
        {pending.result.level === "block" ? (
          <>
            <p className="font-bold text-nasu-700">この内容は送れません</p>
            <p className="text-sm">
              <b>{pending.result.reasons.join("・")}</b> のような情報が入っているみたい。その部分を消してから送ってね。
            </p>
            <button className="btn-primary w-full" onClick={() => close(null)}>
              直す
            </button>
          </>
        ) : (
          <>
            <p className="font-bold text-nasu-700">この内容を送っても大丈夫？</p>
            {pending.result.masked > 0 && (
              <p className="text-sm">名前など {pending.result.masked} か所を「＊＊＊」に置き換えました。</p>
            )}
            {pending.result.level === "confirm" && (
              <p className="text-sm">
                <b>{pending.result.reasons.join("・")}</b> が入っています。あなたが分かる情報なら、消してから送ってね。
              </p>
            )}
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-nasu-50 p-3 text-sm">
              {pending.result.text}
            </p>
            <div className="flex gap-2">
              <button className="btn-soft flex-1" onClick={() => close(null)}>
                直す
              </button>
              <button className="btn-primary flex-1" onClick={() => close(pending.result.text)}>
                この内容で送る
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return { guard, modal };
}
