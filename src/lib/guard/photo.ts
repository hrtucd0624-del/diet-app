// 送信前チェック（写真）。ブラウザの中で動く MediaPipe で、人の顔・人の体が写っていないか調べる。
// 写真は外部に送らない（読み込むのはモデルのファイルだけ）。

import type { FaceDetector, ObjectDetector } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const OBJECT_MODEL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

// 迷ったら止める側に倒す（送れない時は切り抜き直しで対応）
const FACE_THRESHOLD = 0.7; // 料理が 0.3〜0.68、正面の顔は 0.85 前後（2026-10 に試した値）
const PERSON_THRESHOLD = 0.4;

export type PhotoGuardResult = { level: "ok" | "block"; reasons: string[]; scores?: { face: number; person: number } };

let detectors: Promise<{ face: FaceDetector; object: ObjectDetector }> | null = null;

function loadDetectors() {
  if (!detectors) {
    detectors = (async () => {
      const { FilesetResolver, FaceDetector, ObjectDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      const [face, object] = await Promise.all([
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.3,
        }),
        ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: OBJECT_MODEL },
          runningMode: "IMAGE",
          scoreThreshold: 0.3,
          categoryAllowlist: ["person"],
        }),
      ]);
      return { face, object };
    })().catch((e) => {
      detectors = null; // 次回また読み込みを試す
      throw e;
    });
  }
  return detectors;
}

// 写真を選んだ時点で読み込みを始めておく（チェックを速くするため）
export function preloadPhotoGuard() {
  loadDetectors().catch(() => {});
}

export async function checkPhoto(image: Blob): Promise<PhotoGuardResult> {
  let d: Awaited<ReturnType<typeof loadDetectors>>;
  try {
    d = await loadDetectors();
  } catch {
    // チェックできない時は、安全のため送らない
    return { level: "block", reasons: ["写真のチェックを読み込めませんでした（電波のいい所でもう一度ためしてね）"] };
  }
  const bitmap = await createImageBitmap(image);
  try {
    const top = (ds: { categories: { score: number }[] }[]) =>
      Math.max(0, ...ds.flatMap((x) => x.categories.map((c) => c.score)));
    const face = top(d.face.detect(bitmap).detections);
    const person = top(d.object.detect(bitmap).detections);
    const reasons: string[] = [];
    if (face >= FACE_THRESHOLD) reasons.push("人の顔");
    if (person >= PERSON_THRESHOLD) reasons.push("人の体");
    return { level: reasons.length ? "block" : "ok", reasons, scores: { face, person } };
  } finally {
    bitmap.close();
  }
}
