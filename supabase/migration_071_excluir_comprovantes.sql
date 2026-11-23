-- Excluir comprovantes de fatura pelo site (pedido do Brayan em 23/11/2026:
-- "me deixe excluir alguns, opção facilitada").
--
-- Cada comprovante enviado somou +1 fatura e +R$2 na comissão de quem
-- mandou (migration_047). Excluir desfaz isso: -1 fatura e -R$2 por
-- comprovante, pra quem enviou (nunca fica negativo). Também apaga o
-- arquivo do storage.
--
-- Quem pode excluir: o supervisor/líder (qualquer um) e o próprio BKO (só
-- os dele). A exclusão direta na tabela deixa de existir — senão dava pra
-- apagar o comprovante sem descontar a comissão.
--
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create or replace function public.excluir_comprovantes_fatura(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor boolean;
  v_apagados integer := 0;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Faça login de novo.';
  end if;

  v_supervisor := exists (
    select 1 from public.profiles where id = auth.uid() and role in ('supervisor', 'lider')
  );

  -- Confere a permissão de TODOS antes de apagar qualquer um.
  if exists (
    select 1 from public.comprovantes_fatura
    where id = any(p_ids) and not v_supervisor and user_id <> auth.uid()
  ) then
    raise exception 'Você só pode excluir os seus próprios comprovantes.';
  end if;

  -- Desconta a comissão de cada pessoa pela quantidade apagada dela.
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
    v_apagados := v_apagados + r.qtd;
  end loop;

  delete from storage.objects
  where bucket_id = 'comprovantes'
    and name in (select arquivo_path from public.comprovantes_fatura where id = any(p_ids));

  delete from public.comprovantes_fatura where id = any(p_ids);

  return v_apagados;
end;
$$;

revoke execute on function public.excluir_comprovantes_fatura(uuid[]) from public, anon;
grant execute on function public.excluir_comprovantes_fatura(uuid[]) to authenticated;

-- Excluir só pela função acima (que desconta a comissão).
drop policy if exists "comprovantes_fatura_delete_proprio_ou_supervisor" on public.comprovantes_fatura;
