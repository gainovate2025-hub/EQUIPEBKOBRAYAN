-- Dois pedidos do Brayan (26/11/2026):
-- 1) "Meu relatório": cada pessoa anota o próprio dia (contestações feitas,
--    faturas, reagendamentos e anotações livres). Um por dia; mandar de novo
--    no mesmo dia atualiza. Só a própria pessoa vê o dela. NÃO mexe na
--    comissão nem nos contadores do painel: é só registro.
-- 2) "Não quero que meu login apareça em outro computador a não ser o meu":
--    a pessoa pode TRAVAR o login no computador atual (Configurações). Com a
--    trava, o site desloga na hora quem entrar com esse login em outro
--    computador. Só vale pra quem ligar (pedido: só o login do Brayan).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

-- ---------- 1) Meu relatório ----------
create table if not exists public.relatorios_pessoais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default current_date,
  contestacoes integer not null default 0 check (contestacoes >= 0),
  faturas integer not null default 0 check (faturas >= 0),
  reagendamentos integer not null default 0 check (reagendamentos >= 0),
  anotacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, data)
);

alter table public.relatorios_pessoais enable row level security;

drop policy if exists relatorios_pessoais_select on public.relatorios_pessoais;
create policy relatorios_pessoais_select on public.relatorios_pessoais
  for select to authenticated using (user_id = auth.uid());

drop policy if exists relatorios_pessoais_insert on public.relatorios_pessoais;
create policy relatorios_pessoais_insert on public.relatorios_pessoais
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists relatorios_pessoais_update on public.relatorios_pessoais;
create policy relatorios_pessoais_update on public.relatorios_pessoais
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists relatorios_pessoais_delete on public.relatorios_pessoais;
create policy relatorios_pessoais_delete on public.relatorios_pessoais
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.relatorios_pessoais to authenticated;

-- ---------- 2) Travar o login num computador ----------
alter table public.profiles add column if not exists dispositivo_travado text;

-- Liga (com o código do computador atual) ou desliga (vazio) a trava.
create or replace function public.travar_meu_dispositivo(p_dispositivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login de novo.';
  end if;
  update public.profiles
  set dispositivo_travado = nullif(trim(coalesce(p_dispositivo, '')), '')
  where id = auth.uid();
end;
$$;

revoke execute on function public.travar_meu_dispositivo(text) from public, anon;
grant execute on function public.travar_meu_dispositivo(text) to authenticated;

-- O site pergunta isso logo depois do login.
create or replace function public.meu_dispositivo_travado()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select dispositivo_travado from public.profiles where id = auth.uid();
$$;

revoke execute on function public.meu_dispositivo_travado() from public, anon;
grant execute on function public.meu_dispositivo_travado() to authenticated;

-- Se um dia perder o acesso (ex.: limpou os dados do navegador ou trocou de
-- computador), destrave pelo SQL Editor:
--   update public.profiles set dispositivo_travado = null where username = 'SEU_USUARIO';

notify pgrst, 'reload schema';
