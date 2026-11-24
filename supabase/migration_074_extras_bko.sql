-- Extra em dinheiro pros BKOs (pedido do Brayan em 24/11/2026: "adiciona
-- uma parte pra eu colocar extra deles, em dinheiro").
-- Regras que ele escolheu:
--   * o extra SOMA na comissão do BKO (performance.commission) na hora;
--   * motivo é opcional, a data é gravada sozinha;
--   * o BKO NÃO vê a lista de extras (só a comissão dele, que já sobe);
--   * só o supervisor lança/exclui ("o extra só eu posso colocar");
--   * o líder de equipe (ex.: Isaque, portabilidade) também lança/exclui,
--     mas só pros BKOs da equipe dele.
-- Excluir um extra desconta o valor da comissão (nunca fica negativa),
-- igual aos comprovantes (migration_047 / migration_072).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create table if not exists public.extras_bko (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0),
  motivo text,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists extras_bko_criado_em_idx on public.extras_bko (criado_em desc);

alter table public.extras_bko enable row level security;

-- Supervisor vê todos; líder vê só os da equipe dele. Ninguém grava
-- direto: só pelas funções abaixo.
drop policy if exists extras_bko_select_supervisor on public.extras_bko;
create policy extras_bko_select_supervisor on public.extras_bko
  for select using (
    public.meu_papel() = 'supervisor'
    or (
      public.meu_papel() = 'lider'
      and exists (
        select 1 from public.profiles b
        where b.id = extras_bko.user_id and b.team_id = public.my_team_id()
      )
    )
  );

-- Lançar um extra: grava e soma na comissão.
create or replace function public.lancar_extra_bko(
  p_user_id uuid,
  p_valor numeric,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.meu_papel() not in ('supervisor', 'lider') then
    raise exception 'Só o supervisor ou o líder pode lançar extra.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Coloque um valor maior que zero.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'bko') then
    raise exception 'Escolha um BKO.';
  end if;
  if public.meu_papel() = 'lider' and not exists (
    select 1 from public.profiles where id = p_user_id and team_id = public.my_team_id()
  ) then
    raise exception 'Esse BKO não é da sua equipe.';
  end if;

  insert into public.extras_bko (user_id, valor, motivo, criado_por)
  values (p_user_id, round(p_valor, 2), nullif(trim(coalesce(p_motivo, '')), ''), auth.uid());

  -- Se o BKO ainda não tem linha de performance, cria.
  insert into public.performance (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.performance
  set commission = commission + round(p_valor, 2),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke execute on function public.lancar_extra_bko(uuid, numeric, text) from public, anon;
grant execute on function public.lancar_extra_bko(uuid, numeric, text) to authenticated;

-- Excluir um extra: apaga e desconta da comissão (nunca negativa).
create or replace function public.excluir_extra_bko(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if public.meu_papel() not in ('supervisor', 'lider') then
    raise exception 'Só o supervisor ou o líder pode excluir extra.';
  end if;
  if public.meu_papel() = 'lider' and not exists (
    select 1 from public.extras_bko e
    join public.profiles b on b.id = e.user_id
    where e.id = p_id and b.team_id = public.my_team_id()
  ) then
    raise exception 'Esse extra não é da sua equipe.';
  end if;

  delete from public.extras_bko where id = p_id returning user_id, valor into r;
  if r.user_id is null then
    raise exception 'Esse extra já foi excluído.';
  end if;

  update public.performance
  set commission = greatest(commission - r.valor, 0),
      updated_at = now()
  where user_id = r.user_id;
end;
$$;

revoke execute on function public.excluir_extra_bko(uuid) from public, anon;
grant execute on function public.excluir_extra_bko(uuid) to authenticated;
