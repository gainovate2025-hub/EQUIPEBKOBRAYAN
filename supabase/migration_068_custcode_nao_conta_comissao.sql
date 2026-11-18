-- migration_068: CustCode NÃO conta na comissão (18/11/2026, Brayan: "é só
-- pra contar na fatura os que tiverem comprovante"). Desfaz a soma da 067.
-- Fatura conta só pelo comprovante (registrar_comprovante_fatura, 047).
-- Continua bloqueando o mesmo CustCode mandado duas vezes.
-- Os valores já somados pela 067 foram tirados direto no banco.

create or replace function public.enviar_custcode_fatura(p_custcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.normalizar_custcode(p_custcode);
  v_quem text;
begin
  if v_code = '' then
    raise exception 'Informe o CustCode.';
  end if;
  if v_code !~ '^[0-9]{1,2}\.[0-9]{7,8}$' then
    raise exception 'CustCode inválido. Digite no formato 7.2192123.';
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

  insert into public.fatura_custcodes (bko_id, custcode)
  values (auth.uid(), v_code);
end;
$$;

grant execute on function public.enviar_custcode_fatura(text) to authenticated;

create or replace function public.verificar_custcode_fatura(p_id uuid, p_resultado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bko_id uuid;
  v_allowed boolean;
begin
  if p_resultado not in ('saiu', 'refazer') then
    raise exception 'Resultado inválido.';
  end if;

  select bko_id into v_bko_id from public.fatura_custcodes where id = p_id;
  if v_bko_id is null then
    raise exception 'CustCode não encontrado.';
  end if;

  v_allowed := public.is_supervisor() or (
    public.is_lider() and exists (
      select 1 from public.profiles p where p.id = v_bko_id and p.team_id = public.my_team_id()
    )
  );
  if not v_allowed then
    raise exception 'Sem permissão para verificar esse CustCode.';
  end if;

  update public.fatura_custcodes
  set status = p_resultado,
      verificado_em = now(),
      verificado_por = auth.uid()
  where id = p_id;
end;
$$;

grant execute on function public.verificar_custcode_fatura(uuid, text) to authenticated;
