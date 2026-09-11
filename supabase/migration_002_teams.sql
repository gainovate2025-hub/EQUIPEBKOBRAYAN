-- Painel BKO — migração: equipes (times) + papel "lider"
-- Rode este arquivo inteiro no SQL Editor do Supabase (depois do schema.sql original).
-- Seguro rodar mais de uma vez.

-- ---------- TEAMS ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contestacao_label text not null default 'Contestações',
  created_at timestamptz not null default now()
);

-- ---------- profiles: vincular a uma equipe + novo papel "lider" ----------
alter table public.profiles add column if not exists team_id uuid references public.teams(id);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('supervisor', 'bko', 'lider'));

-- ---------- helpers ----------
create or replace function public.is_lider()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'lider'
  );
$$;

create or replace function public.my_team_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- ---------- TEAMS RLS ----------
alter table public.teams enable row level security;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select using (true);

drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams
  for all using (public.is_supervisor()) with check (public.is_supervisor());

-- ---------- PROFILES RLS (substitui as políticas do schema.sql original) ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    auth.uid() = id
    or public.is_supervisor()
    or (public.is_lider() and team_id = public.my_team_id())
  );

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles
  for all using (
    public.is_supervisor()
    or (public.is_lider() and team_id = public.my_team_id())
  ) with check (
    public.is_supervisor()
    or (public.is_lider() and team_id = public.my_team_id())
  );

-- ---------- PERFORMANCE RLS ----------
drop policy if exists performance_select on public.performance;
create policy performance_select on public.performance
  for select using (
    auth.uid() = user_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = performance.user_id and p.team_id = public.my_team_id()
    ))
  );

drop policy if exists performance_write on public.performance;
create policy performance_write on public.performance
  for all using (
    public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = performance.user_id and p.team_id = public.my_team_id()
    ))
  ) with check (
    public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = performance.user_id and p.team_id = public.my_team_id()
    ))
  );

-- ---------- NOTES RLS ----------
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select using (
    auth.uid() = user_id
    or public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = notes.user_id and p.team_id = public.my_team_id()
    ))
  );

drop policy if exists notes_write on public.notes;
create policy notes_write on public.notes
  for all using (
    public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = notes.user_id and p.team_id = public.my_team_id()
    ))
  ) with check (
    public.is_supervisor()
    or (public.is_lider() and exists (
      select 1 from public.profiles p
      where p.id = notes.user_id and p.team_id = public.my_team_id()
    ))
  );
