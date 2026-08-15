-- Painel BKO — schema + RLS
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

create extension if not exists "pgcrypto";

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  role text not null check (role in ('supervisor', 'bko')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- PERFORMANCE ----------
create table if not exists public.performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  contestation_goal integer not null default 0,
  contestations_done integer not null default 0,
  rescheduling_goal integer not null default 0,
  rescheduling_done integer not null default 0,
  commission numeric(12,2) not null default 0,
  objective text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- NOTES ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- helper: is_supervisor() ----------
-- security definer para evitar recursão de RLS ao checar o papel do usuário logado.
create or replace function public.is_supervisor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'supervisor'
  );
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.performance enable row level security;
alter table public.notes enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_supervisor());

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles
  for all using (public.is_supervisor()) with check (public.is_supervisor());

drop policy if exists performance_select on public.performance;
create policy performance_select on public.performance
  for select using (auth.uid() = user_id or public.is_supervisor());

drop policy if exists performance_write on public.performance;
create policy performance_write on public.performance
  for all using (public.is_supervisor()) with check (public.is_supervisor());

drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select using (auth.uid() = user_id or public.is_supervisor());

drop policy if exists notes_write on public.notes;
create policy notes_write on public.notes
  for all using (public.is_supervisor()) with check (public.is_supervisor());
