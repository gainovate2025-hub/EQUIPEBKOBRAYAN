-- Reagendamento fica ainda mais simples: BKO não precisa mais digitar
-- CNPJ/Razão Social/CustCode, só quantos reagendamentos já fez (pedido
-- do Brayan em 05/11/2026: "muda para eles só precisarem mandar quantos
-- eles fizeram no reagendamento"). Mesma tabela reagendamento_casos,
-- com uma coluna nova "quantidade" (cada envio é uma linha com a
-- quantidade enviada, em vez de 1 linha por caso).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.reagendamento_casos
  add column if not exists quantidade integer not null default 1;

drop function if exists public.registrar_reagendamento_proprio(text, text, text);

create or replace function public.registrar_reagendamento_proprio(p_quantidade integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantidade is null or p_quantidade < 1 then
    raise exception 'Informe quantos reagendamentos você fez.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode registrar reagendamento.';
  end if;

  insert into public.reagendamento_casos (bko_id, cnpj, razao_social, custcode, quantidade, status, criado_por, feito_em)
  values (auth.uid(), '', '', '', p_quantidade, 'feito', auth.uid(), now());

  update public.performance
  set rescheduling_done = rescheduling_done + p_quantidade,
      commission = commission + p_quantidade,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

grant execute on function public.registrar_reagendamento_proprio(integer) to authenticated;
