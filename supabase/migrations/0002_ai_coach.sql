-- フェーズ2：AIコーチ
-- Supabase の SQL Editor にこのファイルの中身を貼って実行する。

-- 同意画面で「使う／使わない」を選んだ日時（選んだあとは画面を出さない）
alter table public.profiles add column consent_decided_at timestamptz;

-- AIに送ってよいと確認できた写真か（端末の送信前チェックを通ったものだけ true）
alter table public.meals add column photo_ai_ok boolean not null default false;
