-- 通知の状態確認：5分ごとの時計（cron）が最後に動いた時刻と結果を残す
-- Supabase の SQL Editor にこのファイルの中身を貼って実行する。
create table public.push_status (
  id int primary key default 1 check (id = 1), -- 1行だけ
  last_run_at timestamptz,
  last_result jsonb
);
alter table public.push_status enable row level security;
-- ポリシーなし＝アプリからは読み書きできない（send-push が service_role で使う）
insert into public.push_status (id) values (1) on conflict do nothing;
