// 写真チェック（MediaPipe）の実行ファイルを public/ にコピーする。
// 外部の配信サイトから実行ファイルを読み込まないようにするため（npm install / build の前に自動で動く）
import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";
if (!existsSync(from)) {
  console.warn("copy-mediapipe: @mediapipe/tasks-vision is not installed yet");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`copy-mediapipe: ${from} -> ${to}`);
