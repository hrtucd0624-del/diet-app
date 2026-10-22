// iPhone の Safari で「ホーム画面に追加」する手順
export function AddToHomeGuide() {
  return (
    <ol className="space-y-3 text-sm">
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nasu-500 text-xs text-white">1</span>
        <span>
          Safari の下にある <b>共有ボタン</b>
          <span className="mx-1 inline-block rounded border border-nasu-300 px-1 text-xs">□↑</span>
          をタップ
        </span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nasu-500 text-xs text-white">2</span>
        <span>
          下にスクロールして <b>「ホーム画面に追加」</b> をタップ
        </span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nasu-500 text-xs text-white">3</span>
        <span>
          右上の <b>「追加」</b> をタップ。ホーム画面のなすびアイコンから開いてね
        </span>
      </li>
    </ol>
  );
}
