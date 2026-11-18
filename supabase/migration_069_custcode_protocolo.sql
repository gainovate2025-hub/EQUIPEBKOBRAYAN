-- migration_069: o BKO manda o protocolo junto com o CustCode, e é
-- obrigatório (18/11/2026, pedido do Brayan). Mantém as regras da 068:
-- CustCode não conta na comissão e o mesmo CustCode não vai duas vezes.

alter table public.fatura_custcodes add column if not exists protocolo text;

drop function if exists public.enviar_custcode_fatura(text);

create or replace function public.enviar_custcode_fatura(p_custcode text, p_protocolo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.normalizar_custcode(p_custcode);
  v_protocolo text := regexp_replace(coalesce(p_protocolo, ''), '\s', '', 'g');
  v_quem text;
begin
  if v_code = '' then
    raise exception 'Informe o CustCode.';
  end if;
  if v_code !~ '^[0-9]{1,2}\.[0-9]{7,8}$' then
    raise exception 'CustCode inválido. Digite no formato 7.2192123.';
  end if;
  if v_protocolo = '' then
    raise exception 'Informe o protocolo.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode mandar CustCode.';
  end if;

  perform pg_advisory_xact_lock(hashtext('custcode:' || v_code));

  select coalesce(p.name, 'outro BKO') into v_quem
  from public.fatura_custcodes f
  left join public.profiles p on p.id = f.bko_id
  where public.normalizar_custcode(f.custcode) = v_code
    and f.status <> 'refazer'
  order by f.enviado_em
  limit 1;
  if found then
    raise exception 'Esse CustCode já foi enviado (por %). Não pode mandar duas vezes.', v_quem;
  end if;

  insert into public.fatura_custcodes (bko_id, custcode, protocolo)
  values (auth.uid(), v_code, v_protocolo);
end;
$$;

grant execute on function public.enviar_custcode_fatura(text, text) to authenticated;
