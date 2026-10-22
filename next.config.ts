import type { NextConfig } from "next";

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// ブラウザに「このアプリが読み込んでよい場所」を伝える（他のサイトに埋め込まれない・知らない場所に送らない）
const csp = [
  "default-src 'self'",
  // Next.js の小さな埋め込みスクリプトと、写真チェック（MediaPipe）の WebAssembly
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // 写真：端末内の blob と、Supabase の署名付きURL
  `img-src 'self' data: blob: ${supabase}`,
  // 通信先：Supabase と、写真チェックのモデルファイル
  `connect-src 'self' ${supabase} https://storage.googleapis.com`,
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 使わない機能は止めておく（カメラは写真を選ぶ画面で使うので止めない）
  { key: "Permissions-Policy", value: "microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    // 開発中（npm run dev）は Next.js の仕組みが eval を使うので、本番だけに付ける
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
