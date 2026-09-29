-- Reagendamentos deixa de ser só um contador (BKO digitava "fiz X hoje")
-- e passa a ser uma fila de casos de verdade: o supervisor/líder manda
-- um caso (CNPJ + Razão Social) pro BKO, e o BKO marca como feito quando
-- resolve — aí sim conta na meta e na comissão (+R$1, igual antes).
-- Mesmo padrão de permissão de contestacoes (migration_009): BKO só vê/
-- conclui os próprios; líder vê/manda pro seu time; supervisor vê/manda
-- pra todo mundo.

create table if not exists public.reagendamento_casos (
  id uuid primary key default gen_random_uuid(),
  bko_id uuid not null references public.profiles(id) on delete cascade,
  cnpj text not null,
  razao_social text not null,
  status text not null default 'pendente' check (status in ('pendente', 'feito')),
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  feito_em timestamptz
);

alter table public.reagendamento_casos enable row level security;

drop policy if exists reagendamento_casos_select on public.reagendamento_casos;
create policy reagendamento_casos_select on public.reagendamento_casos
  for select using (
    auth.uid() = bko_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = reagendamento_casos.bko_id and p.team_id = public.my_team_id()
    ))
  );

-- Sem policy de insert/update direta — tudo passa pelas funções abaixo.

create or replace function public.adicionar_reagendamento_caso(p_bko_id uuid, p_cnpj text, p_razao_social text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_team uuid;
  v_allowed boolean;
begin
  if trim(coalesce(p_cnpj, '')) = '' or trim(coalesce(p_razao_social, '')) = '' then
    raise exception 'Informe o CNPJ e a Razão Social.';
  end if;

  select team_id into v_target_team from public.profiles where id = p_bko_id and role = 'bko';
  if v_target_team is null and not exists (select 1 from public.profiles where id = p_bko_id and role = 'bko') then
    raise exception 'BKO não encontrado.';
  end if;

  v_allowed := public.is_supervisor() or (
    public.is_lider() and v_target_team is not null and v_target_team = public.my_team_id()
  );
  if not v_allowed then
    raise exception 'Sem permissão para mandar caso pra esse BKO.';
  end if;

  insert into public.reagendamento_casos (bko_id, cnpj, razao_social, criado_por)
  values (p_bko_id, trim(p_cnpj), trim(p_razao_social), auth.uid());
end;
$$;

grant execute on function public.adicionar_reagendamento_caso(uuid, text, text) to authenticated;

create or replace function public.concluir_reagendamento_caso(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bko_id uuid;
  v_status text;
begin
  select bko_id, status into v_bko_id, v_status from public.reagendamento_casos where id = p_id;
  if v_bko_id is null then
    raise exception 'Caso não encontrado.';
  end if;
  if auth.uid() <> v_bko_id and not public.is_supervisor() and not (
    public.is_lider() and exists (
      select 1 from public.profiles p where p.id = v_bko_id and p.team_id = public.my_team_id()
    )
  ) then
    raise exception 'Sem permissão pra concluir esse caso.';
  end if;
  if v_status = 'feito' then
    return; -- já concluído, não conta duas vezes
  end if;

  update public.reagendamento_casos
  set status = 'feito', feito_em = now()
  where id = p_id;

  update public.performance
  set rescheduling_done = rescheduling_done + 1,
      commission = commission + 1,
      updated_at = now()
  where user_id = v_bko_id;
end;
$$;

grant execute on function public.concluir_reagendamento_caso(uuid) to authenticated;
