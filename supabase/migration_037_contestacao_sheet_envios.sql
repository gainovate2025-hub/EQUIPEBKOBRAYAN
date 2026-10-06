-- Painel BKO — migração: histórico de contestações enviadas na planilha
-- (módulo "Contestação (Faturas)", separado do fluxo de aprovação da
-- migração 009). Hoje essa tela só lê a planilha ao vivo — quando um
-- Cust Code some de lá (resolvido no sistema do TIM/Phoenix2Business, o
-- que pode levar até ~10 dias), a gente perde o histórico. Esta tabela
-- guarda quando cada Cust Code apareceu pela primeira vez na aba e quando
-- saiu dela, sem nunca apagar nada — assim dá pra montar um relatório
-- mensal (filtrando por enviado_em) sem perder os que ainda estão em
-- trânsito na virada do mês.
-- Rode no SQL Editor do Supabase, depois da migração 036.

create table if not exists public.contestacao_sheet_envios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cust_code text not null,
  nome_cliente text not null default '',
  enviado_em timestamptz not null default now(),
  saiu_em timestamptz,
  unique (cust_code)
);

create index if not exists contestacao_sheet_envios_enviado_em_idx
  on public.contestacao_sheet_envios (enviado_em);

alter table public.contestacao_sheet_envios enable row level security;

drop policy if exists contestacao_sheet_envios_select on public.contestacao_sheet_envios;
create policy contestacao_sheet_envios_select on public.contestacao_sheet_envios
  for select using (
    auth.uid() = user_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = contestacao_sheet_envios.user_id and p.team_id = public.my_team_id()
    ))
  );

-- Sem policy de insert/update direta — tudo passa pela função abaixo.

-- Chamada toda vez que alguém abre a tela de Contestação (Faturas), com a
-- lista de Cust Codes que estão na aba AGORA:
--  * quem é novo (ainda não tem linha na tabela) é registrado com
--    enviado_em = agora e user_id = quem abriu a tela (aproximação: nem
--    sempre é quem contestou de fato, mas é o melhor sinal disponível já
--    que a planilha não guarda "quem mandou pra essa aba").
--  * quem estava com saiu_em em branco e não está mais na lista é marcado
--    como saído agora.
-- Nada é apagado, então um Cust Code enviado nos últimos dias do mês
-- continua rastreável mesmo depois do relatório "resetar" (o reset é só
-- o relatório filtrar por mês, não uma limpeza de dados).
create or replace function public.sincronizar_contestacao_sheet(p_custcodes_ativos text[], p_nomes text[] default array[]::text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.contestacao_sheet_envios (user_id, cust_code, nome_cliente)
  select auth.uid(), cc, coalesce(nm, '')
  from unnest(coalesce(p_custcodes_ativos, array[]::text[])) with ordinality as a(cc, ord)
  left join unnest(coalesce(p_nomes, array[]::text[])) with ordinality as b(nm, ord) on a.ord = b.ord
  where trim(coalesce(cc, '')) <> ''
  on conflict (cust_code) do nothing;

  update public.contestacao_sheet_envios
  set saiu_em = now()
  where saiu_em is null
    and not (cust_code = any(coalesce(p_custcodes_ativos, array[]::text[])));
end;
$$;

grant execute on function public.sincronizar_contestacao_sheet(text[], text[]) to authenticated;
