# なすびコーチ

自分で決めたことを毎日続けるための、記録＋AIコーチのアプリ（PWA）。
設計は [docs/design.md](docs/design.md)。すべて無料枠で動かします。

## いまの状態：フェーズ1（AIなし）

- ログイン（メールアドレス＋パスワード。メールは送らない）
- 初回設定（ニックネーム・身長・目標体重〈46kg以上〉・体質メモ・周期・ホーム画面追加の案内）
- ホーム（今日のひとこと・今日やること3つ・連続日数・周期の時期・体調が悪い日は「休む日」）
- 記録（体重・食事〈写真は端末で縮小＆位置情報削除〉・運動・体調・生理）
- グラフ（7日平均の線が主役・毎日の点は薄く・記録できた日・相談できた回数）
- 設定（プロフィール・書き出し・記録の削除・ログアウト）
- RLS（本人のデータは本人だけが読める）

> 設計書ではログインは「マジックリンク」ですが、Supabase 無料枠ではメール本文を変えられず、
> iPhone のホーム画面アプリでリンクを押すと Safari 側でログインしてしまうため、
> **メールアドレス＋パスワード** にしました。2人が登録し終わったら新規登録を止めます。

---

## セットアップ（はじめの1回だけ）

### 1. Supabase（DB・ログイン・写真）

1. https://supabase.com で無料アカウントを作る（GitHub ログインが楽）
2. 「New project」→ 名前は `nasubi-coach`、リージョンは近い場所（Tokyo / Singapore）、DB パスワードは自動生成でOK（パスワード管理アプリに保存）
3. 左メニュー **SQL Editor** → 「New query」→ [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) の中身を全部貼って **Run**
   - 「Success. No rows returned」と出ればOK
4. 左メニュー **Authentication → Sign In / Providers → Email** を開き、
   **Confirm email** をオフにして保存（メールを送らずに登録できるようにする）
5. **Project Settings → API**（または「Connect」ボタン）で次の2つをメモ
   - Project URL
   - `anon` `public` キー（**公開してよいキー**。`service_role` キーは絶対に使わない・貼らない）

### 2. パソコンで動かしてみる（任意）

```bash
cp .env.example .env.local
```

`.env.local` を開いて、さっきの Project URL と anon キーに書き換えてから：

```bash
npm run dev
```

http://localhost:3000 を開く。

### 3. Vercel で公開（iPhone で使うため）

1. https://github.com で無料アカウントを作り、新しい **Private** リポジトリを作る
2. このフォルダを push する（Claude Code に「GitHub に push して」と頼めばOK）
3. https://vercel.com に GitHub でログイン →「Add New → Project」→ そのリポジトリを Import
4. **Environment Variables** に2つ追加して Deploy
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon キー
5. できた URL（例 `https://nasubi-coach.vercel.app`）を Supabase の
   **Authentication → URL Configuration → Site URL** に入れて保存

### 4. 2人とも登録したら、新規登録を止める

本人とパートナーがアプリの「はじめて登録」で登録し終わったら、Supabase の
**Authentication → Sign In / Providers** で **Allow new users to sign up** をオフにする。
これで URL を知っている他の人は登録できなくなる。

> パスワードを忘れた時：Supabase の **Authentication → Users** でそのユーザーを消して登録し直すと
> 記録も消えてしまうので、消す前に Claude Code に相談してください。

---

## iPhone の Safari での動作確認（フェーズ1）

1. iPhone の Safari で Vercel の URL を開く
2. 「はじめて登録」でメールアドレスとパスワードを入れて登録
3. 初回設定を進める
   - 目標体重に `45` を入れると「つぎへ」が押せないこと
4. ホームで「今日やること」を3つ追加 → 4つ目の入力欄が消えること、チェックできること
5. **記録** タブ
   - 体重を入れる → 「記録したよ」が出る。同じ日にもう一度入れると上書き
   - 食事：写真を撮る/選ぶ → プレビュー → 記録 → 下の一覧にサムネイルが出る
   - 運動・体調・生理も1つずつ記録
   - 体調で「だるさ：よくない」か熱 37.5℃以上 → ホームの「今日やること」が **「今日は休む日」** になる
6. **グラフ**：体重を数日分（日付を変えて）入れると、濃い線（7日平均）と薄い点が出る
7. **ホーム画面に追加**：共有ボタン →「ホーム画面に追加」→ なすびアイコンから開く
   - 上にアドレスバーが出ず、アプリのように開くこと
   - Safari とは別あつかいなので、もう一度ログインする（iPhone に保存したパスワードが使える）
8. **設定**：ニックネームを変えるとホームの呼び方が変わる。「記録を書き出す」で JSON が保存できる

うまくいかない時は、画面のスクリーンショットと、どの手順だったかを Claude Code に伝えてください。

---

## 次のフェーズ

- **フェーズ2：AIコーチ**（`coach-system-prompt.md` が必要）
  同意画面 → 送信前チェック → `coach-reply` → チャット → 写真の切り抜き＆`analyze-meal` → やることの自動提案
- フェーズ3：連続記録・お休み券・ご褒美・予定・カウントダウン・通知
- フェーズ4：パートナー
