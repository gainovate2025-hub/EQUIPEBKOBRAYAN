-- Comprovante de fatura com CUSTCODE (pedido do Brayan em 23/11/2026:
-- "na parte de enviar comprovante adiciona a opção de colocar o custcode").
--
-- Coluna nova (opcional) em comprovantes_fatura e a função de registrar
-- passa a receber o custcode. O resto (checagens, +1 fatura e +R$2) é
-- igual à migration_049.
--
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.comprovantes_fatura add column if not exists custcode text;

drop function if exists public.registrar_comprovante_fatura(text, text, text);
drop function if exists public.registrar_comprovante_fatura(text, text, text, text);

create function public.registrar_comprovante_fatura(
  p_arquivo_path text,
  p_arquivo_url text,
  p_observacao text default null,
  p_custcode text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_arquivo_path, '')) = '' or trim(coalesce(p_arquivo_url, '')) = '' then
    raise exception 'Arquivo do comprovante não encontrado.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode enviar comprovante.';
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

  insert into public.comprovantes_fatura (user_id, arquivo_path, arquivo_url, observacao, custcode)
  values (
    auth.uid(), p_arquivo_path, p_arquivo_url,
    nullif(trim(coalesce(p_observacao, '')), ''),
    nullif(trim(coalesce(p_custcode, '')), '')
  );

  update public.performance
  set faturas_done = faturas_done + 1,
      commission = commission + 2,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.registrar_comprovante_fatura(text, text, text, text) from public, anon;
grant execute on function public.registrar_comprovante_fatura(text, text, text, text) to authenticated;
