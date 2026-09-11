-- Sistema de corrida/carros: garagem, loja, melhorias e apostas entre BKOs.
-- Pontos = contestations_done (lido, nunca alterado) menos o que já foi
-- gasto/apostado, registrado na tabela game_wallet_transactions.

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- mesmo nome do arquivo da imagem de referência
  rarity text not null check (rarity in ('comum', 'raro', 'epico', 'lendario')),
  price_points int not null default 0, -- 0 = carro inicial, todo mundo já tem
  min_contestacoes int not null default 0, -- exigência mínima pra poder comprar
  base_speed int not null default 5,
  base_handling int not null default 5,
  sprite_key text not null, -- referência do sprite 2D retrô
  created_at timestamptz not null default now()
);

create table if not exists public.bko_cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  color text not null default '#c62828', -- cor atual (customizável)
  is_equipped boolean not null default false, -- carro exibido no dashboard
  acquired_at timestamptz not null default now(),
  unique (user_id, car_id)
);

create table if not exists public.car_upgrades (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('velocidade', 'curva')),
  tier int not null default 1,
  price_points int not null default 0,
  bonus int not null default 1
);

create table if not exists public.bko_car_upgrades (
  id uuid primary key default gen_random_uuid(),
  bko_car_id uuid not null references public.bko_cars(id) on delete cascade,
  upgrade_id uuid not null references public.car_upgrades(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  unique (bko_car_id, upgrade_id)
);

create table if not exists public.game_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('compra_carro', 'compra_melhoria', 'aposta_ganha', 'aposta_perdida')),
  amount int not null, -- negativo = gasto, positivo = ganho de aposta
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  wager_points int not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada', 'concluida')),
  winner_id uuid references public.profiles(id),
  track_seed int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.cars enable row level security;
alter table public.bko_cars enable row level security;
alter table public.car_upgrades enable row level security;
alter table public.bko_car_upgrades enable row level security;
alter table public.game_wallet_transactions enable row level security;
alter table public.races enable row level security;

-- Catálogo (cars/car_upgrades) todo mundo autenticado pode ler.
drop policy if exists cars_select on public.cars;
create policy cars_select on public.cars for select using (auth.role() = 'authenticated');

drop policy if exists car_upgrades_select on public.car_upgrades;
create policy car_upgrades_select on public.car_upgrades for select using (auth.role() = 'authenticated');

-- Garagem: cada um vê a própria, supervisor vê todas.
drop policy if exists bko_cars_select on public.bko_cars;
create policy bko_cars_select on public.bko_cars for select using (
  user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);
drop policy if exists bko_cars_write on public.bko_cars;
create policy bko_cars_write on public.bko_cars for all using (
  user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);

drop policy if exists bko_car_upgrades_select on public.bko_car_upgrades;
create policy bko_car_upgrades_select on public.bko_car_upgrades for select using (
  exists (select 1 from public.bko_cars where id = bko_car_id and (user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')))
);
drop policy if exists bko_car_upgrades_write on public.bko_car_upgrades;
create policy bko_car_upgrades_write on public.bko_car_upgrades for all using (
  exists (select 1 from public.bko_cars where id = bko_car_id and (user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')))
);

drop policy if exists game_wallet_select on public.game_wallet_transactions;
create policy game_wallet_select on public.game_wallet_transactions for select using (
  user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);
drop policy if exists game_wallet_write on public.game_wallet_transactions;
create policy game_wallet_write on public.game_wallet_transactions for insert with check (auth.role() = 'authenticated');

drop policy if exists races_select on public.races;
create policy races_select on public.races for select using (
  challenger_id = auth.uid() or opponent_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);
drop policy if exists races_write on public.races;
create policy races_write on public.races for all using (
  challenger_id = auth.uid() or opponent_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);

-- Carro inicial (todo mundo começa com este, grátis).
insert into public.cars (name, rarity, price_points, min_contestacoes, base_speed, base_handling, sprite_key)
values ('Opala Preto', 'comum', 0, 0, 5, 5, 'opala_preto')
on conflict (name) do nothing;

insert into public.cars (name, rarity, price_points, min_contestacoes, base_speed, base_handling, sprite_key)
values
  ('Camaro Amarelo', 'raro', 150, 30, 7, 6, 'camaro_amarelo'),
  ('Skyline GTR', 'raro', 200, 50, 7, 7, 'skyline_gtr'),
  ('Relâmpago Marquinhos', 'epico', 350, 100, 8, 8, 'relampago_marquinhos'),
  ('McLaren Amarela', 'lendario', 800, 250, 10, 9, 'mclaren_amarela')
on conflict (name) do nothing;

insert into public.car_upgrades (name, type, tier, price_points, bonus) values
  ('Motor Turbo I', 'velocidade', 1, 50, 1),
  ('Motor Turbo II', 'velocidade', 2, 120, 2),
  ('Suspensão Esportiva I', 'curva', 1, 50, 1),
  ('Suspensão Esportiva II', 'curva', 2, 120, 2)
on conflict do nothing;
