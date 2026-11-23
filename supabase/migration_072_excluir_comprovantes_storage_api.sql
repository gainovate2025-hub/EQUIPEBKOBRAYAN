-- Corrige a 071 (23/11/2026): o Supabase não deixa mais apagar arquivo
-- direto da tabela storage.objects pelo SQL ("Direct deletion from storage
-- tables is not allowed. Use the Storage API instead."). O erro desfazia
-- tudo, então nada era excluído nem descontado.
--
-- Agora a função só apaga o registro e desconta a comissão, e devolve o
-- caminho dos arquivos; o site apaga os arquivos pela Storage API (a
-- permissão de storage da migration_044 já deixa o dono e o supervisor
-- apagarem).
--
-- O reset do mês (botão e agendamento do dia 1) tinha o mesmo problema e
-- falhava inteiro; passa a apagar só os registros. O botão do site apaga
-- os arquivos antes, pela Storage API.
--
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

drop function if exists public.excluir_comprovantes_fatura(uuid[]);

create function public.excluir_comprovantes_fatura(p_ids uuid[])
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor boolean;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Faça login de novo.';
  end if;

  v_supervisor := exists (
    select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'lider')
  );

  if exists (
    select 1 from public.comprovantes_fatura
    where id = any(p_ids) and not v_supervisor and user_id <> auth.uid()
  ) then
    raise exception 'Você só pode excluir os seus próprios comprovantes.';
  end if;

  -- -1 fatura e -R$2 por comprovante, pra quem enviou (nunca negativo).
  for r in
    select user_id, count(*)::int as qtd
    from public.comprovantes_fatura
    where id = any(p_ids)
    group by user_id
  loop
    update public.performance
    set faturas_done = greatest(faturas_done - r.qtd, 0),
        commission = greatest(commission - 2 * r.qtd, 0),
        updated_at = now()
    where user_id = r.user_id;
  end loop;

  return query
    delete from public.comprovantes_fatura
    where id = any(p_ids)
    returning arquivo_path;
end;
$$;

revoke execute on function public.excluir_comprovantes_fatura(uuid[]) from public, anon;
grant execute on function public.excluir_comprovantes_fatura(uuid[]) to authenticated;

drop policy if exists "comprovantes_fatura_delete_proprio_ou_supervisor" on public.comprovantes_fatura;

-- Reset do mês: só os registros (os arquivos o site apaga pela Storage API).
create or replace function public._resetar_comprovantes_mes_impl()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.comprovantes_fatura where true;
end;
$$;

revoke execute on function public._resetar_comprovantes_mes_impl() from public, anon, authenticated;
