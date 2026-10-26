-- Rascunho "Consulta CNPJ + Venda" — reestruturação pedida em 26/10/2026:
-- cada linha vendida agora tem seu próprio titular, tipo (nova/
-- portabilidade) e operadora consultada, guardados juntos num campo só
-- (jsonb) em vez de colunas soltas pra "a venda inteira". Também
-- adiciona ponto de referência, e-mail/CPF do cliente, e quem captou /
-- quem fechou a venda.
--
-- As colunas antigas (numeros_linhas, tipo_linha, titular_tipo,
-- titular_documento, titular_nome, operadora_linha) continuam existindo
-- pra não perder histórico de vendas já salvas, só não são mais escritas
-- por vendas novas.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.vendas_cnpj add column if not exists linhas jsonb;
alter table public.vendas_cnpj add column if not exists ponto_referencia text;
alter table public.vendas_cnpj add column if not exists email_cliente text;
alter table public.vendas_cnpj add column if not exists cpf_cliente text;
alter table public.vendas_cnpj add column if not exists captador text;
alter table public.vendas_cnpj add column if not exists fechou_venda text;
