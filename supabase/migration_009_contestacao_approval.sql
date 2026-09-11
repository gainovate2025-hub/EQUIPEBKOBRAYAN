-- Painel BKO — migração: fluxo de aprovação de contestação
-- Contestação deixa de ser um contador solto e passa a ser um caso
-- individual (com cust code) que nasce "pendente" e só conta na meta/
-- comissão depois que o supervisor autoriza. Nada é apagado — o histórico
-- de quem enviou/decidiu fica sempre na própria linha.
-- Rode no SQL Editor do Supabase, depois da migração 008.

create table if not exists public.contestacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cust_code text not null,
  observacao text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'autorizada', 'recusada')),
  motivo_recusa text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.contestacoes enable row level security;

drop policy if exists contestacoes_select on public.contestacoes;
create policy contestacoes_select on public.contestacoes
  for select using (
    auth.uid() = user_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = contestacoes.user_id and p.team_id = public.my_team_id()
    ))
  );

-- Sem policy de insert/update direta — tudo passa pelas funções abaixo.

create or replace function public.submit_contestacao(p_cust_code text, p_observacao text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if v_role <> 'bko' then
    raise exception 'Somente contas de BKO podem enviar contestação.';
  end if;

  if trim(p_cust_code) = '' then
    raise exception 'Informe o Cust Code.';
  end if;

  insert into public.contestacoes (user_id, cust_code, observacao)
  values (auth.uid(), trim(p_cust_code), coalesce(trim(p_observacao), ''));
end;
$$;

grant execute on function public.submit_contestacao(text, text) to authenticated;

create or replace function public.decide_contestacao(p_id uuid, p_status text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user uuid;
  v_target_team uuid;
  v_old_status text;
  v_allowed boolean;
begin
  if p_status not in ('autorizada', 'recusada', 'pendente') then
    raise exception 'Status inválido.';
  end if;

  select user_id, status into v_target_user, v_old_status
  from public.contestacoes where id = p_id;

  if v_target_user is null then
    raise exception 'Contestação não encontrada.';
  end if;

  select team_id into v_target_team from public.profiles where id = v_target_user;

  v_allowed := public.is_supervisor() or (
    public.is_lider() and v_target_team is not null and v_target_team = public.my_team_id()
  );

  if not v_allowed then
    raise exception 'Sem permissão para decidir esta contestação.';
  end if;

  if p_status = 'recusada' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da recusa.';
  end if;

  update public.contestacoes
  set
    status = p_status,
    motivo_recusa = case when p_status = 'recusada' then trim(p_motivo) else null end,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_id;

  -- só mexe na contagem oficial quando o status muda de/para "autorizada"
  if v_old_status <> 'autorizada' and p_status = 'autorizada' then
    update public.performance
    set contestations_done = contestations_done + 1,
        commission = commission + 2,
        updated_at = now()
    where user_id = v_target_user;
  elsif v_old_status = 'autorizada' and p_status <> 'autorizada' then
    update public.performance
    set contestations_done = greatest(0, contestations_done - 1),
        commission = greatest(0, commission - 2),
        updated_at = now()
    where user_id = v_target_user;
  end if;
end;
$$;

grant execute on function public.decide_contestacao(uuid, text, text) to authenticated;

-- ---------- registro diário agora só cuida de reagendamento ----------
-- Contestação sai daqui — passa a exigir aprovação (funções acima).

create or replace function public.submit_daily_report(p_reagendamentos integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if v_role <> 'bko' then
    raise exception 'Somente contas de BKO podem enviar registro diário.';
  end if;

  if p_reagendamentos is null or p_reagendamentos <= 0 then
    raise exception 'Informe uma quantidade de reagendamentos.';
  end if;

  insert into public.daily_reports (user_id, contestacoes, reagendamentos)
  values (auth.uid(), 0, p_reagendamentos);

  update public.performance
  set
    rescheduling_done = rescheduling_done + p_reagendamentos,
    commission = commission + p_reagendamentos,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;
