-- 安全対策（脆弱性チェックの結果）
-- Supabase の SQL Editor にこのファイルの中身を貼って実行する。

-- =========================================================
-- 1) 写真の置き場：JPEG だけ・1枚 3MB まで（アプリは 1024px の JPEG にしてから送る）
--    大きなファイルで無料の保存容量を使い切られるのを防ぐ
-- =========================================================
update storage.buckets
set file_size_limit = 3 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg']
where id = 'meal-photos';

-- =========================================================
-- 2) 文字数の上限（画面だけでなく DB でも守る。長すぎる文で AI の無料枠を使い切られないように）
--    既にある行は調べない（NOT VALID）。これから入る行だけ守る
-- =========================================================
alter table public.chat_messages add constraint chat_text_len check (char_length(text) <= 2000) not valid;
alter table public.meals add constraint meal_note_len check (char_length(note) <= 500) not valid;
alter table public.conditions add constraint condition_note_len check (char_length(note) <= 500) not valid;
alter table public.exercises add constraint exercise_note_len check (char_length(note) <= 200) not valid;
alter table public.exercises add constraint exercise_kind_len check (char_length(kind) <= 30) not valid;
alter table public.schedules add constraint schedule_title_len check (char_length(title) <= 60) not valid;
alter table public.events add constraint event_title_len check (char_length(title) <= 60) not valid;
alter table public.rewards add constraint reward_title_len check (char_length(title) <= 60) not valid;
alter table public.profiles add constraint nickname_len check (char_length(nickname) between 1 and 20) not valid;
alter table public.profiles add constraint body_notes_len check (char_length(body_notes) <= 500) not valid;
alter table public.profiles add constraint timezone_len check (char_length(timezone) <= 64) not valid;

-- =========================================================
-- 3) 役割（owner / partner）は本人が書き換えられないようにする
--    （パートナーが自分を owner にして、本人のデータを読もうとするのを防ぐ。フェーズ4の準備）
-- =========================================================
create function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'role cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- =========================================================
-- 4) AI を呼んだ回数の記録（1日の上限に使う）。本人は読める・増やせるが、消せない
-- =========================================================
create table public.ai_calls (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  action text not null check (action in ('reply', 'analyze_meal', 'suggest_todos')),
  created_at timestamptz not null default now()
);
create index on public.ai_calls (owner_id, created_at);
alter table public.ai_calls enable row level security;
create policy "own ai calls: read" on public.ai_calls
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "own ai calls: add" on public.ai_calls
  for insert to authenticated with check (owner_id = (select auth.uid()));

-- 古い記録は30日で消す（0004 で pg_cron をオンにしてある前提）
select cron.unschedule('cleanup-ai-calls') where exists (select 1 from cron.job where jobname = 'cleanup-ai-calls');
select cron.schedule('cleanup-ai-calls', '15 4 * * *', $$ delete from public.ai_calls where created_at < now() - interval '30 days' $$);
