-- Configuração da nova tela de Faturas (planilha "Controle de fatura",
-- Google Sheets): qual aba usar e em qual coluna cada informação está —
-- editável pelo supervisor no site, sem precisar mexer em código toda
-- vez que a planilha mudar (abas trocam de mês em mês, e os nomes das
-- colunas não são sempre os mesmos). Mesmo padrão do
-- parcelamento_config (migration_024/026) — uma linha só (id sempre 1).
--
-- aba_nome fica em branco de propósito: só o supervisor sabe qual aba
-- (mês) está em uso agora, e a tela de Faturas deve avisar "não
-- configurado" enquanto isso não for preenchido, em vez de adivinhar
-- errado.

create table if not exists public.faturas_config (
  id int primary key default 1,
  aba_nome text not null default '',
  coluna_nome text not null default 'CLIENTE',
  coluna_cnpj text not null default 'CNPJ',
  coluna_custcode text not null default 'CUSTCODE',
  coluna_telefone text not null default 'TEL.PRINCIPAL',
  coluna_status text not null default 'STATUS LINHA',
  coluna_protocolo text not null default 'OBS',
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now(),
  constraint faturas_config_singleton check (id = 1)
);

insert into public.faturas_config (id) values (1)
  on conflict (id) do nothing;

alter table public.faturas_config enable row level security;

-- Todo mundo autenticado (BKO, líder, supervisor) só LÊ essa
-- configuração — precisa pra saber em qual coluna procurar cada coisa.
drop policy if exists faturas_config_select on public.faturas_config;
create policy faturas_config_select on public.faturas_config
  for select using (auth.role() = 'authenticated');

-- Só supervisor edita.
drop policy if exists faturas_config_update on public.faturas_config;
create policy faturas_config_update on public.faturas_config
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor'));
