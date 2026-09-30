-- Permite trocar a planilha de cada módulo (fatura/contestacao), igual a
-- automação do P2B deixa escolher a planilha — cola o link, busca as
-- abas e escolhe. Em branco, continua usando a planilha padrão
-- "Controle de fatura" (hardcoded na Edge Function sheets-faturas).

alter table public.planilha_modulos_config
  add column if not exists sheet_url text not null default '';
