// フェーズ1：最小限のサービスワーカー（ホーム画面追加のため）。
// 通知（push）はフェーズ3で追加する。キャッシュはしない（古い画面が残らないように）。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
