-- Relatório do BKO numa aba só: reagendamentos, contestações e faturas.
-- Não precisa preencher tudo — só um dos três já vale.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
--
-- Regras:
--  * reagendamentos: soma na meta/comissão (igual ao registro diário de antes)
--  * contestações e faturas: só ficam registradas pro supervisor ver — NÃO
--    entram na meta/comissão (contestação só conta depois de aprovada, na
--    tela de Aprovação).

alter table public.daily_reports add column if not exists faturas integer not null default 0;

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

  if v_r > 0 then
    update public.performance
    set
      rescheduling_done = rescheduling_done + v_r,
      commission = commission + v_r,
      updated_at = now()
    where user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.submit_relatorio_diario(integer, integer, integer) to authenticated;
