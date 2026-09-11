-- Painel BKO — migração: cust code no registro diário
-- Cada envio do BKO passa a poder incluir um "cust code" (código do
-- cliente/caso), que fica salvo e listado pro admin/lider ver depois.
-- Rode no SQL Editor do Supabase, depois da migração 007.

alter table public.daily_reports add column if not exists cust_code text;

create or replace function public.submit_daily_report(
  p_contestacoes integer,
  p_reagendamentos integer,
  p_cust_code text default null
)
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

  insert into public.daily_reports (user_id, contestacoes, reagendamentos, cust_code)
  values (auth.uid(), p_contestacoes, p_reagendamentos, nullif(trim(p_cust_code), ''));

  update public.performance
  set
    contestations_done = contestations_done + p_contestacoes,
    rescheduling_done = rescheduling_done + p_reagendamentos,
    commission = commission + (p_contestacoes * 2) + (p_reagendamentos * 1),
    updated_at = now()
  where user_id = auth.uid();
end;
$$;
