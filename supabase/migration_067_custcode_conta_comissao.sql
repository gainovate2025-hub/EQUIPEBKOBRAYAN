-- migration_067: CustCode de fatura passa a contar na comissão e no
-- ranking (18/11/2026, Brayan: "as faturas enviadas não tão contando na
-- comissão e no ranking"). Os BKOs mandam a fatura pela tela de CustCode
-- (migration_048), que só guardava o código e nunca somava nada.
--
-- Regras (respostas do Brayan):
--   * cada CustCode enviado vale +R$ 2,00 na comissão (e +1 em "Faturas");
--   * o mesmo CustCode não pode ser mandado duas vezes (bloqueia). Só pode
--     mandar de novo se o supervisor marcou "Refazer" no anterior; nesse
--     caso o "Refazer" tira os R$ 2,00 e o reenvio soma de novo;
--   * soma também os que já foram mandados (sem repetidos e sem o que não
--     é CustCode, tipo CNPJ ou data).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez (a soma
-- dos antigos só acontece uma vez, marcada na coluna conta_comissao).

alter table public.fatura_custcodes add column if not exists conta_comissao boolean not null default false;

-- "7. 2204554" / ". 7.2200026" -> "7.2204554" / "7.2200026"
create or replace function public.normalizar_custcode(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '\s', '', 'g'), '^\.+', '');
$$;

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

  -- Dois envios iguais ao mesmo tempo não passam juntos.
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

  insert into public.fatura_custcodes (bko_id, custcode, conta_comissao)
  values (auth.uid(), v_code, true);

  update public.performance
  set faturas_done = faturas_done + 1,
      commission = commission + 2,
      updated_at = now()
  where user_id = auth.uid();
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
  v public.fatura_custcodes;
  v_allowed boolean;
begin
  if p_resultado not in ('saiu', 'refazer') then
    raise exception 'Resultado inválido.';
  end if;

  select * into v from public.fatura_custcodes where id = p_id for update;
  if not found then
    raise exception 'CustCode não encontrado.';
  end if;

  v_allowed := public.is_supervisor() or (
    public.is_lider() and exists (
      select 1 from public.profiles p where p.id = v.bko_id and p.team_id = public.my_team_id()
    )
  );
  if not v_allowed then
    raise exception 'Sem permissão para verificar esse CustCode.';
  end if;

  -- "Refazer" tira os R$ 2,00 (o BKO manda de novo e soma de novo).
  -- Voltar de "Refazer" pra "Saiu" devolve.
  if p_resultado = 'refazer' and v.conta_comissao then
    update public.performance
    set faturas_done = greatest(faturas_done - 1, 0), commission = commission - 2, updated_at = now()
    where user_id = v.bko_id;
    v.conta_comissao := false;
  elsif p_resultado = 'saiu' and v.status = 'refazer' and not v.conta_comissao then
    update public.performance
    set faturas_done = faturas_done + 1, commission = commission + 2, updated_at = now()
    where user_id = v.bko_id;
    v.conta_comissao := true;
  end if;

  update public.fatura_custcodes
  set status = p_resultado,
      conta_comissao = v.conta_comissao,
      verificado_em = now(),
      verificado_por = auth.uid()
  where id = p_id;
end;
$$;

grant execute on function public.verificar_custcode_fatura(uuid, text) to authenticated;

-- Soma dos que já foram mandados: vale o 1º envio de cada CustCode válido
-- (não conta repetido, nem "Refazer", nem CNPJ/data/etc.). Só roda uma vez:
-- depois disso já existe linha com conta_comissao = true.
do $$
begin
  if exists (select 1 from public.fatura_custcodes where conta_comissao) then
    return;
  end if;

  update public.fatura_custcodes
  set custcode = public.normalizar_custcode(custcode)
  where custcode <> public.normalizar_custcode(custcode);

  with primeiros as (
    select distinct on (custcode) id
    from public.fatura_custcodes
    where status <> 'refazer'
      and custcode ~ '^[0-9]{1,2}\.[0-9]{7,8}$'
    order by custcode, enviado_em
  )
  update public.fatura_custcodes f
  set conta_comissao = true
  from primeiros
  where f.id = primeiros.id;

  update public.performance pe
  set faturas_done = pe.faturas_done + s.qtd,
      commission = pe.commission + s.qtd * 2,
      updated_at = now()
  from (
    select bko_id, count(*) as qtd
    from public.fatura_custcodes
    where conta_comissao
    group by bko_id
  ) s
  where pe.user_id = s.bko_id;
end;
$$;
