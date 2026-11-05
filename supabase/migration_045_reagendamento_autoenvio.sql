-- Reagendamento muda de "supervisor manda caso pro BKO fazer" pra "BKO
-- manda direto o que já fez" (pedido do Brayan em 05/11/2026: "quero
-- poder mandar os reagendamento não ver oque tem pra fazer"). Mesma
-- tabela/contagem de antes (reagendamento_casos, rescheduling_done,
-- commission +R$1) — só muda quem registra e quando: agora já entra como
-- "feito" na hora, sem fila de pendência.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create or replace function public.registrar_reagendamento_proprio(
  p_cnpj text,
  p_razao_social text,
  p_custcode text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_cnpj, '')) = '' or trim(coalesce(p_razao_social, '')) = '' then
    raise exception 'Informe o CNPJ e a Razão Social.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode registrar reagendamento.';
  end if;

  insert into public.reagendamento_casos (bko_id, cnpj, razao_social, custcode, status, criado_por, feito_em)
  values (auth.uid(), trim(p_cnpj), trim(p_razao_social), trim(coalesce(p_custcode, '')), 'feito', auth.uid(), now());

  update public.performance
  set rescheduling_done = rescheduling_done + 1,
      commission = commission + 1,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

grant execute on function public.registrar_reagendamento_proprio(text, text, text) to authenticated;
