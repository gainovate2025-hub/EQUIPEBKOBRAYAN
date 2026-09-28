-- Fila de casos do bot do WhatsApp: quando o cliente pede falar com um
-- atendente, o caso cai numa fila COMPARTILHADA — todo mundo do time vê,
-- e quem clicar em "Pegar caso" primeiro fica com ele.
--
-- Roteamento (fixo, por assunto):
--   fatura        -> time do Brayan
--   portabilidade -> time do Isaque
-- (o bot já resolve isso sozinho, usando os IDs configurados nele)
--
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create table if not exists public.whatsapp_casos (
  id bigserial primary key,
  telefone text not null,
  nome text not null,
  cnpj text,
  assunto text not null check (assunto in ('fatura', 'portabilidade')),
  team_id uuid not null references public.teams(id),
  status text not null default 'pendente' check (status in ('pendente', 'em_atendimento')),
  pego_por uuid references public.profiles(id),
  pego_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists whatsapp_casos_team_status_idx on public.whatsapp_casos(team_id, status);

alter table public.whatsapp_casos enable row level security;

-- O bot escreve sem estar logado (usa a chave anon) — só INSERT, sem
-- poder ler nem alterar nada depois.
drop policy if exists whatsapp_casos_insert on public.whatsapp_casos;
create policy whatsapp_casos_insert on public.whatsapp_casos
  for insert with check (true);

-- Cada BKO/líder só vê os casos do PRÓPRIO time; supervisor vê todos.
drop policy if exists whatsapp_casos_select on public.whatsapp_casos;
create policy whatsapp_casos_select on public.whatsapp_casos
  for select using (team_id = public.my_team_id() or public.is_supervisor());

-- Sem policy de update direta — só via função abaixo, que garante que
-- dois BKOs não conseguem pegar o mesmo caso ao mesmo tempo.
create or replace function public.whatsapp_pegar_caso(p_id bigint)
returns public.whatsapp_casos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso public.whatsapp_casos;
  v_team_id uuid;
begin
  select team_id into v_team_id from public.profiles where id = auth.uid();
  if v_team_id is null then
    raise exception 'Você não pertence a um time.';
  end if;

  update public.whatsapp_casos
  set status = 'em_atendimento', pego_por = auth.uid(), pego_em = now()
  where id = p_id and status = 'pendente' and team_id = v_team_id
  returning * into v_caso;

  if v_caso.id is null then
    raise exception 'Esse caso já foi pego por outra pessoa, ou não é do seu time.';
  end if;

  return v_caso;
end;
$$;

grant execute on function public.whatsapp_pegar_caso(bigint) to authenticated;
