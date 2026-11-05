-- Comprovante de fatura passa a contar na hora: cada envio soma +1 em
-- faturas_done e +R$2,00 na comissão do BKO (pedido do Brayan em
-- 05/11/2026: "quando ele mandar pode constar já pra comissão dele 2
-- reais por cliente"). O insert na tabela comprovantes_fatura passa a
-- ser feito por essa função (security definer) em vez de direto pelo
-- front, porque performance só é editável por supervisor via RLS.
-- Rode no SQL Editor do Supabase (depois da 044). Seguro rodar mais de
-- uma vez.

create or replace function public.registrar_comprovante_fatura(
  p_arquivo_path text,
  p_arquivo_url text,
  p_observacao text default null
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

  insert into public.comprovantes_fatura (user_id, arquivo_path, arquivo_url, observacao)
  values (auth.uid(), p_arquivo_path, p_arquivo_url, nullif(trim(coalesce(p_observacao, '')), ''));

  update public.performance
  set faturas_done = faturas_done + 1,
      commission = commission + 2,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

grant execute on function public.registrar_comprovante_fatura(text, text, text) to authenticated;
