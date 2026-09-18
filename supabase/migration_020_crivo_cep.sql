-- Crivo: coluna opcional de CEP. Quando o operador já sabe o CEP da
-- empresa, manda junto com o CNPJ — a extensão preenche esse CEP no
-- formulário e clica na lupa dele ANTES de mexer no CNPJ, ajudando a
-- carregar o endereço da empresa de antemão (útil quando o CNPJ sozinho
-- não estava sendo suficiente pra tela reconhecer a empresa).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.crivo_consultas add column if not exists cep text;
