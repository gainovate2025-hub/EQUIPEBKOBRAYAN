-- Faturas do relatório passam a CONTAR NA HORA (sem aprovação), igual aos
-- reagendamentos: somam no total de faturas do BKO e na comissão (+1 cada).
-- Contestações do relatório continuam só registradas (a contestação de
-- verdade conta pela tela de Aprovação).
-- Rode no SQL Editor do Supabase (depois da 028). Seguro rodar mais de uma vez.

alter table public.performance add column if not exists faturas_done integer not null default 0;

create or replace function public.submit_relatorio_diario(
  p_reagendamentos integer,
  p_contestacoes integer,
  p_faturas integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_r integer := greatest(coalesce(p_reagendamentos, 0), 0);
  v_c integer := greatest(coalesce(p_contestacoes, 0), 0);
  v_f integer := greatest(coalesce(p_faturas, 0), 0);
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if v_role <> 'bko' then
    raise exception 'Somente contas de BKO podem enviar relatório.';
  end if;
  if v_r + v_c + v_f <= 0 then
    raise exception 'Preencha pelo menos um dos campos (reagendamentos, contestações ou faturas).';
  end if;

  insert into public.daily_reports (user_id, contestacoes, reagendamentos, faturas)
  values (auth.uid(), v_c, v_r, v_f);

  if v_r > 0 or v_f > 0 then
    update public.performance
    set
      rescheduling_done = rescheduling_done + v_r,
      faturas_done = faturas_done + v_f,
      commission = commission + v_r + v_f,
      updated_at = now()
    where user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.submit_relatorio_diario(integer, integer, integer) to authenticated;
