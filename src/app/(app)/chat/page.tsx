import Link from "next/link";

// フェーズ2で AI コーチのチャットにする
export default function ChatPage() {
  return (
    <div className="space-y-4 pt-6">
      <h1 className="text-xl font-bold text-nasu-700">コーチに相談</h1>
      <div className="card">
        <p className="leading-relaxed">
          AIコーチは準備中です。もうすぐ、食べる前の相談や、食べたあとのリカバリーを一緒に考えられるようになります。
        </p>
        <p className="mt-3 text-sm text-nasu-600">今は、食べたものを記録しておくと、あとでコーチが参考にできるよ。</p>
      </div>
      <Link href="/record?tab=meal" className="btn-primary w-full">
        食事を記録する
      </Link>
    </div>
  );
}
