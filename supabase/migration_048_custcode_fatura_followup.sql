-- Acompanhamento de CustCode de fatura (pedido do Brayan em 06/11/2026):
-- BKO manda só o CustCode depois que faz a contestação; o setor
-- responsável demora de 5 a 10 dias pra fazer sair a fatura. Depois de
-- 5 dias sem sair, o caso entra numa lista "pra verificar" — o
-- supervisor confere manualmente (no sistema da operadora) se já saiu
-- e marca "Saiu" ou "Refazer" (aí o BKO vê que precisa reenviar o
-- custcode e refazer a contestação).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create table if not exists public.fatura_custcodes (
  id uuid primary key default gen_random_uuid(),
  bko_id uuid not null references public.profiles(id) on delete cascade,
  custcode text not null,
  status text not null default 'pendente' check (status in ('pendente', 'saiu', 'refazer')),
  enviado_em timestamptz not null default now(),
  verificado_em timestamptz,
  verificado_por uuid references public.profiles(id)
);

create index if not exists fatura_custcodes_bko_id_idx on public.fatura_custcodes (bko_id);
create index if not exists fatura_custcodes_enviado_em_idx on public.fatura_custcodes (enviado_em desc);

alter table public.fatura_custcodes enable row level security;

drop policy if exists fatura_custcodes_select on public.fatura_custcodes;
create policy fatura_custcodes_select on public.fatura_custcodes
  for select using (
    auth.uid() = bko_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = fatura_custcodes.bko_id and p.team_id = public.my_team_id()
    ))
  );

-- Sem policy de insert/update direta — tudo passa pelas funções abaixo.

create or replace function public.enviar_custcode_fatura(p_custcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_custcode, '')) = '' then
    raise exception 'Informe o CustCode.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode mandar CustCode.';
  end if;

  insert into public.fatura_custcodes (bko_id, custcode)
  values (auth.uid(), trim(p_custcode));
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
