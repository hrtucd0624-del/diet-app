-- フェーズ3：続ける仕組み（お休み券・週のご褒美・予定・通知の設定）
-- Supabase の SQL Editor にこのファイルの中身を貼って実行する。
-- 週は月曜はじまり。

-- =========================================================
-- お休み券：週に1回、記録しなかった日を「休んだ日」にできる（連続記録が切れない）
-- =========================================================
create table public.rest_passes (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  week_start date generated always as (date_trunc('week', date::timestamp)::date) stored,
  created_at timestamptz not null default now(),
  unique (owner_id, date),
  unique (owner_id, week_start)
);
alter table public.rest_passes enable row level security;
create policy "owner only" on public.rest_passes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 続いた日（記録した日 ＋ お休み券を使った日）
create view public.streak_days
with (security_invoker = true) as
select owner_id, date from public.recorded_days
union
select owner_id, date from public.rest_passes;

-- 連続日数をお休み券込みで数え直す
create or replace function public.record_streak(p_today date)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select distinct date from public.streak_days
    where owner_id = (select auth.uid()) and date <= p_today
  ),
  start_day as (
    select case
      when exists (select 1 from days where date = p_today) then p_today
      else p_today - 1
    end as d
  ),
  numbered as (
    select date, (select d from start_day) - date as gap,
           row_number() over (order by date desc) - 1 as rn
    from days
    where date <= (select d from start_day)
  )
  select count(*)::int from numbered where gap = rn;
$$;

-- 今週（月曜〜今日）に続いた日数。ご褒美の達成条件に使う
create function public.week_days_done(p_today date)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct date)::int from public.streak_days
  where owner_id = (select auth.uid())
    and date between date_trunc('week', p_today::timestamp)::date and p_today;
$$;

-- =========================================================
-- 通知の設定（時刻は端末のタイムゾーンで解釈する）
-- =========================================================
alter table public.profiles
  add column notify_morning time not null default '07:30',
  add column notify_evening time not null default '21:30',
  add column notify_work_end boolean not null default true,
  add column timezone text not null default 'Asia/Tokyo';

-- 送った通知の記録（同じ通知を2回送らないため）。サーバーだけが使う
create table public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref text not null, -- 朝・夜は日付、バイト終わりは予定のID
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.push_log enable row level security;
-- ポリシーなし＝アプリからは読み書きできない（Edge Function が service_role で使う）
