-- Rascunho "Consulta CNPJ + Venda": adiciona situação cadastral, data de
-- abertura e atividade principal — faltavam na tela (pedido do Brayan em
-- 23/10/2026). Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.vendas_cnpj add column if not exists situacao text;
alter table public.vendas_cnpj add column if not exists data_abertura text;
alter table public.vendas_cnpj add column if not exists atividade_principal text;
