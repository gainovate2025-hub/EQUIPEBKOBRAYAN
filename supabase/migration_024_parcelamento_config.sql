-- Configuração da automação "Portal Parcelamento": qual planilha usar.
-- Antes ficava só no popup da extensão (cada Chrome com sua própria
-- configuração, sem ninguém mais ver ou poder trocar) — agora fica aqui,
-- editável pelo supervisor no site, e a extensão só LÊ essa linha antes
-- de começar a trabalhar. Uma linha só (id sempre 1).

create table if not exists public.parcelamento_config (
  id int primary key default 1,
  apps_script_url text,
  sheet_url text,
  aba_nome text not null default 'Custo Code',
  ligado boolean not null default false,
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now(),
  constraint parcelamento_config_singleton check (id = 1)
);

insert into public.parcelamento_config (id) values (1)
  on conflict (id) do nothing;

alter table public.parcelamento_config enable row level security;

-- A extensão (rodando com a chave anon, sem login) só precisa LER esta
-- configuração — nunca escreve nela.
drop policy if exists parcelamento_config_select on public.parcelamento_config;
create policy parcelamento_config_select on public.parcelamento_config
  for select using (true);

-- Só supervisor edita, direto pelo site.
drop policy if exists parcelamento_config_update on public.parcelamento_config;
create policy parcelamento_config_update on public.parcelamento_config
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor'));
