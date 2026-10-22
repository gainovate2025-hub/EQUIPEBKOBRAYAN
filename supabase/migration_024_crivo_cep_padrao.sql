-- Crivo: configuração global (1 linha só) — guarda o CEP padrão que a
-- automação usa quando a consulta não veio com um CEP específico.
-- Serve principalmente pro caso em que o campo de CNPJ trava (fica cinza,
-- não deixa digitar) no 1º sistema: a extensão clica em Clientes >
-- Adicionar pra abrir um formulário novo, mas esse formulário sempre pede
-- CEP de novo — sem um padrão configurado, ficaria sem saber o que
-- preencher ali. Rode no SQL Editor do Supabase. Seguro rodar mais de uma
-- vez.

create table if not exists public.crivo_configuracoes (
  id int primary key default 1,
  cep_padrao text,
  atualizado_em timestamptz not null default now(),
  constraint crivo_configuracoes_unica_linha check (id = 1)
);

insert into public.crivo_configuracoes (id) values (1) on conflict (id) do nothing;

alter table public.crivo_configuracoes enable row level security;

-- A extensão (chave anon, sem login) só precisa LER o CEP padrão. Qualquer
-- pessoa autenticada no painel pode ler e atualizar.
drop policy if exists crivo_configuracoes_select on public.crivo_configuracoes;
create policy crivo_configuracoes_select on public.crivo_configuracoes
  for select using (true);

drop policy if exists crivo_configuracoes_update on public.crivo_configuracoes;
create policy crivo_configuracoes_update on public.crivo_configuracoes
  for update using (auth.role() = 'authenticated');
