# なすびコーチ

自分で決めたことを毎日続けるための、記録＋AIコーチのアプリ（PWA）。
設計は [docs/design.md](docs/design.md)。すべて無料枠で動かします。

## いまの状態：フェーズ3（続ける仕組み）まで

### フェーズ3
- 連続記録に **お休み券**（週1回、記録しなかった日を「お休みの日」にできる。ホームにも案内が出る）
- **今週のご褒美**（食べ物以外。条件は「今週◯日続ける」。週は月曜はじまり。達成でお祝い）
- **予定**（バイト・ピラティスなど）と **イベントのカウントダウン**（場所は持たない）
- **通知**（Web Push）：朝・バイト終わり・夜。通知文はテンプレートでAIは使わない
  - pg_cron が5分ごとに Edge Function **`send-push`** を呼ぶ（これで Supabase の一時停止も防ぐ）
  - iOS の通知は止まることがあるので、同じ内容をホームの 🔔 にも出す
- まだ：古い写真を90日後に縮小する仕組み（設計書 9章）

### フェーズ2（AIコーチ）

### フェーズ2
- 同意画面（初回設定の中、フェーズ1から使っている人には一度だけ表示）
- 送信前チェック（端末の中だけで動く）
  - 文章：本名・パートナーの名前・伏せたい言葉は「＊＊＊」に置き換え／電話・メール・郵便番号・住所・カード番号などは送れない／URL・@アカウントは確認
  - 写真：料理を切り抜く画面を必ず通る → 縮小・位置情報削除 → 人の顔・体が写っていたら送れない（MediaPipe）
- コーチとのチャット（Gemini 無料枠。混んでいる時は1回だけ自動で再試行）
- 食事の写真の分析（カロリーの数字は出さず、量は「軽め／ふつう／しっかり」）
- 「今日やること」をコーチが提案、ホームにコーチの今日の一言
- AIの処理は Supabase の Edge Function **`coach`** 1つにまとめた（設計書の `coach-reply` と `analyze-meal`。管理画面に貼るのが1回で済むように）
- コーチの指示書：[docs/coach-system-prompt.md](docs/coach-system-prompt.md)（4章の例「東京で再会」は、場所を送らない方針に合わせて「大切な人に会う日」に変更）

### フェーズ1（AIなし）

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

### 4. ユーザーを作る（新規登録はオフのまま）

アプリの「はじめて登録」は使わず、Supabase の管理画面でユーザーを作る。
こうすると、URL を知っている他の人は登録できない。

1. **Authentication → Sign In / Providers** の **Allow new users to sign up** はオフのまま
2. **Authentication → Users → Add user → Create new user**
3. メールとパスワードを入れ、**Auto Confirm User** にチェックして作成
4. アプリの「ログイン」タブから、そのメールとパスワードでログイン

パートナーのアカウントもフェーズ4で同じように作る。

### パスワードを変える・忘れた時

- **ログインできる時**：アプリの **設定 → パスワード** で変えられる
- **忘れてログインできない時**：Supabase の **SQL Editor** で次を実行する
  （ユーザーを消して作り直すと記録も消えるので、消さないこと）

  ```sql
  update auth.users
  set encrypted_password = extensions.crypt('新しいパスワード', extensions.gen_salt('bf'))
  where email = 'ログインに使っているメールアドレス';
  ```

  1. `新しいパスワード` と `メールアドレス` を書き換えて **Run**（「Success. 1 row」と出ればOK）
  2. アプリの「ログイン」から新しいパスワードで入る
  3. SQL Editor にパスワードが残らないよう、このクエリは保存せずに閉じる（保存した時は削除する）

### 5. AIコーチ（フェーズ2）

1. **SQL Editor** で [`supabase/migrations/0002_ai_coach.sql`](supabase/migrations/0002_ai_coach.sql) を実行
2. https://aistudio.google.com →「Get API key」→「Create API key」でキーを作る（**チャットやコードには貼らない**）
3. Supabase の **Edge Functions → Secrets** に2つ追加
   - `GEMINI_API_KEY` = さっきのキー
   - `GEMINI_MODEL` = `gemini-3.8-flash`（無料枠で使えるモデル。使えなくなったらここだけ変える）
   - `GEMINI_FALLBACK_MODEL` = `gemini-3.5-flash-lite`（混んでいる時の予備。無料枠はモデルごとに別）
4. **Edge Functions →「Deploy a new function」→「Via Editor」**
   - 名前：`coach`
   - 中身：[`supabase/functions/coach/index.ts`](supabase/functions/coach/index.ts) を全部貼る（Claude Code に「コピーして」と頼めばクリップボードに入れてくれる）
   - **Deploy**
5. GitHub Desktop で **Push origin**（Vercel に自動で反映）

> コーチの話し方を変えたい時は `docs/coach-system-prompt.md` を直して `node scripts/build-coach.mjs` を実行し、
> できた `index.ts` を管理画面の `coach` に貼り直して Deploy する。

### 6. 続ける仕組みと通知（フェーズ3）

1. **SQL Editor** で [`supabase/migrations/0003_keep_going.sql`](supabase/migrations/0003_keep_going.sql) を実行
2. **Edge Functions → Secrets** に3つ追加（通知用の鍵は `.vapid-keys.json` にある。GitHub には上がらない）
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` = `.vapid-keys.json` の publicKey / privateKey
   - `VAPID_SUBJECT` = `https://diet-app-v8vf.vercel.app`
3. **Edge Functions → Deploy a new function → Via Editor**
   - 名前：`send-push`、中身：[`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts)
   - **「Verify JWT」をオフ**にして Deploy（cron から呼ぶため。中で合言葉とログインを自分で確かめている）
4. **Edge Functions → coach** に [`supabase/functions/coach/index.ts`](supabase/functions/coach/index.ts) を貼り直して Deploy（ご褒美の計算を更新）
5. **Integrations（または Database → Extensions）** で **pg_cron** と **pg_net** をオンにしてから、
   **SQL Editor** で [`supabase/migrations/0004_push_cron.sql`](supabase/migrations/0004_push_cron.sql) を実行
6. GitHub Desktop で **Push origin**

---

## iPhone での動作確認（フェーズ3）

1. **ホーム画面のアプリ**から開く → **設定 → 通知 →「この端末で通知をオンにする」** → 許可
2. 「テスト通知を送る」→ 数秒で通知が届く
3. **ホーム →「今週のご褒美」** → ご褒美と日数を決める → 今週の ✓ が並ぶ
4. **予定** → 楽しみなイベントを追加 → ホームに「あと◯日」
5. **予定** → 今日のバイトを「10分後に終わる」時刻で追加 → 終わってから5〜10分で「お疲れさま」の通知
6. 昨日の記録がない時 → ホームに「☕ 昨日をお休みの日にする」→ 押すと続いている日数がつながる
7. 朝・夜の通知時刻を設定で変えて、その時刻のあと5分以内に届くか見る

---

## iPhone の Safari での動作確認（フェーズ2）

1. アプリを開くと **同意画面** が出る →「分かった。AIコーチを使う」
2. **設定 → 送信前チェック** に本名とパートナーの名前を入れる
3. **ホーム →「食べる前に相談」** → 「これ食べていい？ アイス」と送る → 「考え中…」のあと返事が来る
4. 送信前チェック
   - 本名を入れて送る →「＊＊＊」に置き換えた文が出て、選べる
   - `090-1234-5678` を入れて送る →「この内容は送れません」
   - `https://example.com` を入れる →「送っても大丈夫？」
5. チャットの 📷 → 料理の写真 → 切り抜き画面で枠を動かす →「この範囲で決定」→ 送る
   - 自分の顔が写った写真 →「この写真はAIに送れません」
6. **記録 → 食事** で写真つきで記録 → 少しあとに「量：ふつう・糖質 多め…」と💬の一言が出る
7. **ホーム →「✨ コーチに提案してもらう」** → やることが増えて、上の一言が「コーチから今日の一言」になる
8. **設定 → AIコーチをオフ** → チャットが「オフになっています」になり、記録はそのまま使える

---

## iPhone の Safari での動作確認（フェーズ1）

1. iPhone の Safari で Vercel の URL を開く
2. 「ログイン」タブで、Supabase で作ったメールアドレスとパスワードを入れる
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

- フェーズ4：パートナー
