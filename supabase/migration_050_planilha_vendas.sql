-- Planilha de vendas (10/11/2026): assim que a operação sobe a ficha da
-- venda, o painel já escreve os dados do cliente numa linha nova da
-- planilha configurada em Configurações > Planilha de vendas.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

-- 1) Novo "módulo" de planilha: vendas (os outros são fatura,
--    contestacao e reagendamento). Guarda o link e a aba escolhidos pelo
--    supervisor.
alter table public.planilha_modulos_config
  drop constraint if exists planilha_modulos_config_modulo_check;
alter table public.planilha_modulos_config
  add constraint planilha_modulos_config_modulo_check
  check (modulo in ('fatura', 'contestacao', 'reagendamento', 'vendas'));

insert into public.planilha_modulos_config (modulo) values ('vendas')
  on conflict (modulo) do nothing;

-- 2) Marca em cada venda se ela já entrou na planilha (e em qual linha),
--    pra dar pra tentar de novo quando a planilha falhar.
alter table public.vendas_cnpj add column if not exists na_planilha boolean not null default false;
alter table public.vendas_cnpj add column if not exists linha_planilha integer;
