-- Envio de produção da PORTABILIDADE (pedido do Brayan em 24/11/2026:
-- "ele tem que mandar o número de SIM que fizeram e de CNPJ de casos que
-- fizeram").
-- Regras que ele escolheu:
--   * o BKO manda só QUANTIDADES: quantos SIM e quantos CNPJs (casos) trabalhou;
--   * pode mandar quantas vezes quiser, cada envio SOMA;
--   * cada SIM vale R$ 2 na comissão e conta em "Portabilidades (SIM)"
--     (performance.contestations_done, ver migration_075);
--   * os CNPJs trabalhados ficam em performance.casos_portabilidade (só contagem).
-- Excluir um envio desconta tudo de volta (nunca fica negativo). Pode excluir:
-- o próprio BKO, o líder da equipe dele ou o supervisor.
-- Precisa da migration_075 (teams.tipo). Rode no SQL Editor do Supabase.
-- Seguro rodar mais de uma vez.

alter table public.performance
  add column if not exists casos_portabilidade integer not null default 0;

create table if not exists public.envios_portabilidade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sim integer not null check (sim >= 0),
  casos integer not null check (casos >= 0),
  criado_em timestamptz not null default now()
);

create index if not exists envios_portabilidade_criado_em_idx
  on public.envios_portabilidade (criado_em desc);

alter table public.envios_portabilidade enable row level security;

-- BKO vê os dele; líder vê os da equipe; supervisor vê todos.
-- Ninguém grava direto: só pelas funções abaixo.
drop policy if exists envios_portabilidade_select on public.envios_portabilidade;
create policy envios_portabilidade_select on public.envios_portabilidade
  for select using (
    user_id = auth.uid()
    or public.meu_papel() = 'supervisor'
    or (
      public.meu_papel() = 'lider'
      and exists (
        select 1 from public.profiles b
        where b.id = envios_portabilidade.user_id and b.team_id = public.my_team_id()
      )
    )
  );

create or replace function public.enviar_portabilidade(p_sim integer, p_casos integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    join public.teams t on t.id = p.team_id
    where p.id = auth.uid() and p.role = 'bko' and t.tipo = 'portabilidade'
  ) then
    raise exception 'Só BKO da equipe de portabilidade pode enviar.';
  end if;
  if p_sim is null or p_casos is null or p_sim < 0 or p_casos < 0 then
    raise exception 'Preencha os dois números (pode ser 0).';
  end if;
  if p_sim = 0 and p_casos = 0 then
    raise exception 'Coloque pelo menos 1 SIM ou 1 CNPJ.';
  end if;
  if p_sim > p_casos then
    raise exception 'O número de SIM não pode ser maior que o de CNPJs trabalhados.';
  end if;
  if p_casos > 2000 then
    raise exception 'Número de CNPJs muito alto. Confira e mande de novo.';
  end if;

  insert into public.envios_portabilidade (user_id, sim, casos)
  values (auth.uid(), p_sim, p_casos);

  insert into public.performance (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  update public.performance
  set contestations_done = contestations_done + p_sim,
      casos_portabilidade = casos_portabilidade + p_casos,
      commission = commission + p_sim * 2,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.enviar_portabilidade(integer, integer) from public, anon;
grant execute on function public.enviar_portabilidade(integer, integer) to authenticated;

create or replace function public.excluir_envio_portabilidade(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select e.user_id, e.sim, e.casos, b.team_id into r
  from public.envios_portabilidade e
  join public.profiles b on b.id = e.user_id
  where e.id = p_id;

  if r.user_id is null then
    raise exception 'Esse envio já foi excluído.';
  end if;
  if not (
    r.user_id = auth.uid()
    or public.meu_papel() = 'supervisor'
    or (public.meu_papel() = 'lider' and r.team_id = public.my_team_id())
  ) then
    raise exception 'Você não pode excluir esse envio.';
  end if;

  delete from public.envios_portabilidade where id = p_id;

  update public.performance
  set contestations_done = greatest(contestations_done - r.sim, 0),
      casos_portabilidade = greatest(casos_portabilidade - r.casos, 0),
      commission = greatest(commission - r.sim * 2, 0),
      updated_at = now()
  where user_id = r.user_id;
end;
$$;

revoke execute on function public.excluir_envio_portabilidade(uuid) from public, anon;
grant execute on function public.excluir_envio_portabilidade(uuid) to authenticated;
