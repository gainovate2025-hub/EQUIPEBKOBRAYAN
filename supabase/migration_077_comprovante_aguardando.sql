-- CUSTCODE sem comprovante = "Aguardando comprovante" (pedido do Brayan em
-- 24/11/2026: "uma opção pra quem faz a fatura enviar o custcode sem
-- comprovante, pra depois pegarem o comprovante e subirem; essas não contam
-- ainda na comissão").
-- Regras:
--   * o BKO pode registrar só o CUSTCODE (sem arquivo): fica "Aguardando
--     comprovante" e NÃO conta na comissão nem em faturas;
--   * depois ele anexa o arquivo naquele mesmo registro: aí conta +1 fatura
--     e +R$2, como um comprovante normal;
--   * excluir um que ainda está aguardando não desconta nada;
--   * o reset do mês não apaga os que ainda estão aguardando.
-- Aguardando = arquivo_path vazio. Precisa da migration_073 (custcode).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.comprovantes_fatura alter column arquivo_path drop not null;
alter table public.comprovantes_fatura alter column arquivo_url drop not null;
alter table public.comprovantes_fatura add column if not exists comprovado_em timestamptz;

-- 1) Registrar só o CUSTCODE (sem arquivo, não conta na comissão).
create or replace function public.registrar_custcode_aguardando(
  p_custcode text,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode enviar.';
  end if;
  if trim(coalesce(p_custcode, '')) !~ '^\d+\.\d+$' then
    raise exception 'Preencha o CUSTCODE (ex: 7.2248162).';
  end if;
  if exists (
    select 1 from public.comprovantes_fatura
    where user_id = auth.uid() and arquivo_path is null and custcode = trim(p_custcode)
  ) then
    raise exception 'Esse CUSTCODE já está aguardando comprovante.';
  end if;

  insert into public.comprovantes_fatura (user_id, arquivo_path, arquivo_url, observacao, custcode)
  values (auth.uid(), null, null, nullif(trim(coalesce(p_observacao, '')), ''), trim(p_custcode));
end;
$$;

revoke execute on function public.registrar_custcode_aguardando(text, text) from public, anon;
grant execute on function public.registrar_custcode_aguardando(text, text) to authenticated;

-- 2) Anexar o comprovante num que estava aguardando: agora conta.
create or replace function public.anexar_comprovante_fatura(
  p_id uuid,
  p_arquivo_path text,
  p_arquivo_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_path text;
begin
  select user_id, arquivo_path into v_dono, v_path
  from public.comprovantes_fatura where id = p_id;

  if v_dono is null then
    raise exception 'Esse registro não existe mais.';
  end if;
  if v_dono <> auth.uid() then
    raise exception 'Só quem enviou o CUSTCODE pode anexar o comprovante.';
  end if;
  if v_path is not null then
    raise exception 'Esse CUSTCODE já tem comprovante.';
  end if;
  if trim(coalesce(p_arquivo_path, '')) = '' or trim(coalesce(p_arquivo_url, '')) = '' then
    raise exception 'Arquivo do comprovante não encontrado.';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'comprovantes'
      and name = p_arquivo_path
      and (storage.foldername(name))[1] = auth.uid()::text
  ) then
    raise exception 'Arquivo do comprovante não encontrado. Envie o arquivo de novo.';
  end if;
  if exists (select 1 from public.comprovantes_fatura where arquivo_path = p_arquivo_path) then
    raise exception 'Esse comprovante já foi registrado.';
  end if;
  if p_arquivo_url not like '%/storage/v1/object/public/comprovantes/' || p_arquivo_path then
    raise exception 'Link do comprovante inválido.';
  end if;

  update public.comprovantes_fatura
  set arquivo_path = p_arquivo_path,
      arquivo_url = p_arquivo_url,
      comprovado_em = now()
  where id = p_id and arquivo_path is null;

  insert into public.performance (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  update public.performance
  set faturas_done = faturas_done + 1,
      commission = commission + 2,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.anexar_comprovante_fatura(uuid, text, text) from public, anon;
grant execute on function public.anexar_comprovante_fatura(uuid, text, text) to authenticated;

-- 3) Excluir: só desconta os que TÊM comprovante (aguardando não contou).
create or replace function public.excluir_comprovantes_fatura(p_ids uuid[])
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

  for r in
    select user_id, count(*)::int as qtd
    from public.comprovantes_fatura
    where id = any(p_ids) and arquivo_path is not null
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

-- 4) Reset do mês: mantém os que ainda estão aguardando comprovante.
create or replace function public._resetar_comprovantes_mes_impl()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.comprovantes_fatura where arquivo_path is not null;
end;
$$;

revoke execute on function public._resetar_comprovantes_mes_impl() from public, anon, authenticated;

notify pgrst, 'reload schema';
