-- Comprovantes de fatura enviada (pedido do Brayan em 05/11/2026): quem
-- manda fatura sobe o comprovante do dia, o supervisor vê um relatório do
-- dia, e todo mês isso zera de vez (apaga os registros e os arquivos).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

-- 1) Bucket de storage pros arquivos (fotos/print do comprovante).
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', true)
on conflict (id) do nothing;

drop policy if exists "comprovantes_storage_insert_proprio" on storage.objects;
create policy "comprovantes_storage_insert_proprio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "comprovantes_storage_select_autenticado" on storage.objects;
create policy "comprovantes_storage_select_autenticado" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprovantes');

drop policy if exists "comprovantes_storage_delete_proprio_ou_supervisor" on storage.objects;
create policy "comprovantes_storage_delete_proprio_ou_supervisor" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comprovantes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'lider'))
    )
  );

-- 2) Tabela com o registro de cada comprovante enviado.
create table if not exists public.comprovantes_fatura (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  arquivo_path text not null,
  arquivo_url text not null,
  observacao text,
  enviado_em timestamptz not null default now()
);

create index if not exists comprovantes_fatura_enviado_em_idx on public.comprovantes_fatura (enviado_em desc);
create index if not exists comprovantes_fatura_user_id_idx on public.comprovantes_fatura (user_id);

alter table public.comprovantes_fatura enable row level security;

drop policy if exists "comprovantes_fatura_insert_proprio" on public.comprovantes_fatura;
create policy "comprovantes_fatura_insert_proprio" on public.comprovantes_fatura
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comprovantes_fatura_select_proprio_ou_supervisor" on public.comprovantes_fatura;
create policy "comprovantes_fatura_select_proprio_ou_supervisor" on public.comprovantes_fatura
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'lider'))
  );

drop policy if exists "comprovantes_fatura_delete_proprio_ou_supervisor" on public.comprovantes_fatura;
create policy "comprovantes_fatura_delete_proprio_ou_supervisor" on public.comprovantes_fatura
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'lider'))
  );

-- 3) Reset mensal — apaga os arquivos do storage e as linhas da tabela.
-- Implementação "crua" (sem checar quem chama) pra poder ser usada tanto
-- pelo agendamento automático (cron, que não tem um auth.uid() de
-- usuário) quanto pela função pública abaixo (chamada pelo botão manual
-- no site, essa sim exige ser supervisor).
create or replace function public._resetar_comprovantes_mes_impl()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from storage.objects
  where bucket_id = 'comprovantes'
    and name in (select arquivo_path from public.comprovantes_fatura);

  delete from public.comprovantes_fatura;
end;
$$;

create or replace function public.resetar_comprovantes_mes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'lider')) then
    raise exception 'Só supervisor pode resetar os comprovantes do mês.';
  end if;
  perform public._resetar_comprovantes_mes_impl();
end;
$$;

grant execute on function public.resetar_comprovantes_mes() to authenticated;

-- 4) Agendamento automático — todo dia 1 do mês, às 00:05, reseta sozinho.
-- Precisa da extensão pg_cron habilitada no projeto (Database → Extensions
-- → pg_cron, no painel do Supabase) — se não conseguir habilitar, o botão
-- manual "Resetar mês" no site continua funcionando normalmente, só não
-- reseta sozinho.
create extension if not exists pg_cron;

select cron.unschedule('resetar_comprovantes_mensal')
where exists (select 1 from cron.job where jobname = 'resetar_comprovantes_mensal');

select cron.schedule(
  'resetar_comprovantes_mensal',
  '5 0 1 * *',
  $$select public._resetar_comprovantes_mes_impl()$$
);
