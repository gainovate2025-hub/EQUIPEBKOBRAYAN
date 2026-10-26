-- Rascunho "Consulta CNPJ + Venda" — melhorias pedidas em 26/10/2026:
-- UF da empresa (pra tela de desempenho do supervisor), titular da linha
-- separado em PF/PJ com documento e nome próprios, e um campo reservado
-- pra guardar a operadora da linha (Vivo/Claro/TIM) assim que a consulta
-- de operadora for integrada.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.vendas_cnpj add column if not exists uf text;

alter table public.vendas_cnpj add column if not exists titular_tipo text check (titular_tipo in ('pf', 'pj'));
alter table public.vendas_cnpj add column if not exists titular_documento text;
alter table public.vendas_cnpj add column if not exists titular_nome text;

-- Reservado — ainda não preenchido automaticamente (depende de integrar a
-- consulta em consultaoperadora.com.br, pendente).
alter table public.vendas_cnpj add column if not exists operadora_linha text;
