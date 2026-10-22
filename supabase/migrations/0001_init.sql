-- フェーズ1：テーブル・RLS・計算用の関数
-- Supabase の SQL Editor にこのファイルの中身を貼って実行する。
-- パートナー向けの閲覧ポリシーはフェーズ4で追加する（今は本人だけが読める）。

-- =========================================================
-- プロフィール
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'partner')),
  nickname text not null default 'なすび',
  height_cm numeric(4, 1) check (height_cm between 100 and 220),
  target_weight_kg numeric(4, 1) check (target_weight_kg >= 46),
  body_notes text,
  cycle_length_days int not null default 28 check (cycle_length_days between 20 and 45),
  consent_ai boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

-- サインアップ時にプロフィールを自動で作る
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- パートナー関連（フェーズ4で使う）
-- =========================================================
create table public.pairs (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  partner_id uuid unique references public.profiles (id) on delete set null,
  invite_code text unique not null,
  created_at timestamptz not null default now()
);

create table public.share_settings (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  weight_mode text not null default 'none' check (weight_mode in ('none', 'avg', 'daily')),
  share_meal_photos boolean not null default false,
  share_cycle boolean not null default false
);

-- =========================================================
-- 記録
-- =========================================================
create table public.weights (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  weight_kg numeric(4, 1) not null check (weight_kg between 25 and 200),
  body_fat_pct numeric(3, 1) check (body_fat_pct between 3 and 70),
  unique (owner_id, date)
);

create table public.meals (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null, -- 端末の日付（連続記録の計算に使う）
  eaten_at timestamptz not null default now(),
  note text,
  photo_path text,
  ai_analysis jsonb,
  asked_before boolean not null default false
);
create index on public.meals (owner_id, date);

create table public.exercises (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  kind text not null,
  minutes int check (minutes between 1 and 600),
  note text
);
create index on public.exercises (owner_id, date);

create table public.conditions (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  fever_c numeric(3, 1) check (fever_c between 34 and 43),
  stomach text check (stomach in ('good', 'so-so', 'bad')),
  fatigue text check (fatigue in ('good', 'so-so', 'bad')),
  note text,
  unique (owner_id, date)
);

create table public.cycles (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  unique (owner_id, start_date)
);

create table public.todos (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  text text not null check (char_length(text) between 1 and 60),
  done boolean not null default false,
  source text not null default 'self' check (source in ('coach', 'self'))
);
create index on public.todos (owner_id, date);

-- =========================================================
-- フェーズ2〜4で使うテーブル（先に作っておく）
-- =========================================================
create table public.schedules (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  kind text not null default 'other' check (kind in ('work', 'pilates', 'other')),
  title text
);

create table public.events (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  title text not null -- 場所は持たない
);

create table public.rewards (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_start date not null,
  title text not null,
  required_days int not null default 5 check (required_days between 1 and 7),
  used_rest_pass boolean not null default false,
  achieved_at timestamptz,
  unique (owner_id, week_start)
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  text text not null,
  photo_path text,
  created_at timestamptz not null default now()
);
create index on public.chat_messages (owner_id, created_at);

create table public.cheers (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  from_partner_id uuid not null references public.profiles (id) on delete cascade,
  stamp text not null,
  text text check (char_length(text) <= 100),
  created_at timestamptz not null default now(),
  shown_to_coach boolean not null default false
);

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- RLS：すべてのテーブルで有効化。今は本人の行だけ読み書きできる
-- =========================================================
alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.share_settings enable row level security;
alter table public.weights enable row level security;
alter table public.meals enable row level security;
alter table public.exercises enable row level security;
alter table public.conditions enable row level security;
alter table public.cycles enable row level security;
alter table public.todos enable row level security;
alter table public.schedules enable row level security;
alter table public.events enable row level security;
alter table public.rewards enable row level security;
alter table public.chat_messages enable row level security;
alter table public.cheers enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "own share settings" on public.share_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 本人のデータだけ読み書きできるテーブル
do $$
declare
  t text;
begin
  foreach t in array array[
    'weights', 'meals', 'exercises', 'conditions', 'cycles', 'todos',
    'schedules', 'events', 'rewards', 'chat_messages'
  ] loop
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- pairs / cheers はフェーズ4でポリシーを追加する（それまでは誰も読み書きできない）

-- =========================================================
-- 計算：7日平均・連続記録・周期の時期
-- =========================================================

-- 毎日の体重と、その日までの7日間の平均（RLSが効くよう security_invoker）
create view public.weights_with_avg
with (security_invoker = true) as
select
  owner_id,
  date,
  weight_kg,
  round(
    avg(weight_kg) over (
      partition by owner_id
      order by date
      range between interval '6 days' preceding and current row
    ),
    2
  ) as avg7_kg
from public.weights;

-- 何かを記録した日
create view public.recorded_days
with (security_invoker = true) as
select owner_id, date from public.weights
union
select owner_id, date from public.meals
union
select owner_id, date from public.exercises
union
select owner_id, date from public.conditions
union
select owner_id, date from public.todos where done;

-- 連続記録日数。今日まだ記録していなくても、昨日まで続いていれば途切れていない扱い
create function public.record_streak(p_today date)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select distinct date from public.recorded_days
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

-- 周期の時期（例：「生理前」）。データが無ければ null
create function public.cycle_phase(p_today date)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  c record;
  len int;
  day int;
begin
  select start_date, end_date into c
  from public.cycles
  where owner_id = (select auth.uid()) and start_date <= p_today
  order by start_date desc
  limit 1;

  if not found then
    return null;
  end if;

  select cycle_length_days into len from public.profiles where id = (select auth.uid());
  day := p_today - c.start_date + 1;

  if (c.end_date is null and day <= 7) or (c.end_date is not null and p_today <= c.end_date) then
    return '生理中';
  elsif day > len then
    return '生理前（予定日を過ぎています）';
  elsif day > len - 7 then
    return '生理前';
  elsif day between len - 16 and len - 12 then
    return '排卵期のころ';
  else
    return '生理後';
  end if;
end;
$$;

-- =========================================================
-- 写真の保存場所（非公開）。パスの先頭フォルダがユーザーIDのものだけ扱える
-- =========================================================
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy "meal photos: own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal photos: own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal photos: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
