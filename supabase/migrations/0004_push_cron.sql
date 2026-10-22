-- フェーズ3：通知の定期実行（pg_cron が5分ごとに Edge Function "send-push" を呼ぶ）
-- 先に Edge Function "send-push" を作ってから、SQL Editor でこのファイルを実行する。
-- これは Supabase を毎日動かし続ける役目もある（7日間使われないと一時停止されるため）。

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- cron だけが知っている合言葉を Vault（暗号化して保存する場所）に作る
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron_secret')
where not exists (select 1 from vault.secrets where name = 'push_cron_secret');

-- Edge Function が「cron から呼ばれたか」を確かめるための関数（service_role だけが使える）
create or replace function public.check_push_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'push_cron_secret' and decrypted_secret = p_secret
  );
$$;
revoke all on function public.check_push_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_push_cron_secret(text) to service_role;

-- 5分ごとに send-push を呼ぶ（URL はこのプロジェクトのもの）
select cron.unschedule('send-push') where exists (select 1 from cron.job where jobname = 'send-push');
select cron.schedule(
  'send-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vobspsnqzueuskbwzbch.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- 送った通知の記録は60日で消す（毎日 4:00 UTC）
select cron.unschedule('cleanup-push-log') where exists (select 1 from cron.job where jobname = 'cleanup-push-log');
select cron.schedule(
  'cleanup-push-log',
  '0 4 * * *',
  $$ delete from public.push_log where created_at < now() - interval '60 days' $$
);
