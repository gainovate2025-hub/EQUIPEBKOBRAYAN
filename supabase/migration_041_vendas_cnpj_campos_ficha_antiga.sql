-- Rascunho "Consulta CNPJ + Venda" — campos que faltavam comparando com
-- a ficha antiga (Google Forms) que o Brayan mandou em 26/10/2026: nome
-- do cliente, telefone que consta no 3C, supervisor responsável, e tipo
-- de chip (eSIM/físico) por linha (dentro do jsonb "linhas", não precisa
-- de coluna nova pra isso).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.vendas_cnpj add column if not exists nome_cliente text;
alter table public.vendas_cnpj add column if not exists telefone_cliente text;
alter table public.vendas_cnpj add column if not exists supervisor text;
