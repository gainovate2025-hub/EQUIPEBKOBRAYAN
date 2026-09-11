-- Painel BKO — migração: registro diário (autorrelato do BKO)
-- Rode no SQL Editor do Supabase, depois das migrações 001/002.
-- Seguro rodar mais de uma vez.

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  contestacoes integer not null default 0,
  reagendamentos integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.daily_reports enable row level security;

drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select on public.daily_reports
  for select using (
    auth.uid() = user_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = daily_reports.user_id and p.team_id = public.my_team_id()
    ))
  );

-- Sem policy de insert/update direta nesta tabela: toda escrita passa pela
-- função abaixo, que só permite ao próprio BKO somar aos próprios números
-- (nunca definir um valor arbitrário, nunca mexer em meta/comissão/objetivo).

create or replace function public.submit_daily_report(p_contestacoes integer, p_reagendamentos integer)
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

  if p_contestacoes < 0 or p_reagendamentos < 0 then
    raise exception 'Quantidades não podem ser negativas.';
  end if;

  if p_contestacoes = 0 and p_reagendamentos = 0 then
    raise exception 'Informe pelo menos uma quantidade.';
  end if;

  insert into public.daily_reports (user_id, contestacoes, reagendamentos)
  values (auth.uid(), p_contestacoes, p_reagendamentos);

  update public.performance
  set
    contestations_done = contestations_done + p_contestacoes,
    rescheduling_done = rescheduling_done + p_reagendamentos,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

grant execute on function public.submit_daily_report(integer, integer) to authenticated;
