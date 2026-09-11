-- Racha entre BKOs: usa a tabela "races" já criada na migration_010, só
-- adiciona os campos de resultado de cada lado e permite que colegas de
-- equipe se enxerguem (precisa pra escolher quem desafiar).

alter table public.races add column if not exists challenger_time numeric;
alter table public.races add column if not exists opponent_time numeric;
alter table public.races add column if not exists challenger_bateu boolean not null default false;
alter table public.races add column if not exists opponent_bateu boolean not null default false;

-- Colegas do mesmo time podem ver uns aos outros (só o necessário pra montar
-- a lista de "quem desafiar": nome/usuário/id). Antes só supervisor/líder
-- enxergavam profiles de outras pessoas.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    auth.uid() = id
    or public.is_supervisor()
    or (public.is_lider() and team_id = public.my_team_id())
    or (team_id is not null and team_id = public.my_team_id())
  );
