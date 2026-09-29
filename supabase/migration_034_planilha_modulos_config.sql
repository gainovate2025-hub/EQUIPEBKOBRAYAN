-- Generaliza a configuração de planilha: em vez de uma tabela só pra
-- Fatura (faturas_config), agora são 3 "módulos" (fatura, contestacao,
-- reagendamento) na MESMA planilha "Controle de fatura", cada um com sua
-- própria aba e mapeamento de coluna — telas separadas, sem duplicar.
-- Traz o que já tinha sido configurado pra Fatura, não perde nada.

create table if not exists public.planilha_modulos_config (
  modulo text primary key check (modulo in ('fatura', 'contestacao', 'reagendamento')),
  aba_nome text not null default '',
  coluna_nome text not null default 'CLIENTE',
  coluna_cnpj text not null default 'CNPJ',
  coluna_custcode text not null default 'CUSTCODE',
  coluna_telefone text not null default 'TEL.PRINCIPAL',
  coluna_status text not null default 'STATUS LINHA',
  coluna_protocolo text not null default 'OBS',
  coluna_vendedor text not null default 'VENDEDOR',
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now()
);

alter table public.planilha_modulos_config enable row level security;

drop policy if exists planilha_modulos_config_select on public.planilha_modulos_config;
create policy planilha_modulos_config_select on public.planilha_modulos_config
  for select using (auth.role() = 'authenticated');

drop policy if exists planilha_modulos_config_update on public.planilha_modulos_config;
create policy planilha_modulos_config_update on public.planilha_modulos_config
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor'));

-- Traz o que já foi configurado pra Fatura (se a tabela antiga existir e
-- tiver dado) — não faz o supervisor configurar tudo de novo.
insert into public.planilha_modulos_config
  (modulo, aba_nome, coluna_nome, coluna_cnpj, coluna_custcode, coluna_telefone, coluna_status, coluna_protocolo, coluna_vendedor)
select 'fatura', aba_nome, coluna_nome, coluna_cnpj, coluna_custcode, coluna_telefone, coluna_status, coluna_protocolo, coluna_vendedor
from public.faturas_config where id = 1
on conflict (modulo) do nothing;

insert into public.planilha_modulos_config (modulo) values ('contestacao'), ('reagendamento')
  on conflict (modulo) do nothing;
