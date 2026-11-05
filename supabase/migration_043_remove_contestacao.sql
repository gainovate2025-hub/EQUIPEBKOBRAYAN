-- Remove de vez as tabelas e funções do fluxo de contestação (pedido do
-- Brayan em 05/11/2026: tirar as telas de contestação do site e apagar os
-- dados também). Fica de fora dessa limpeza, de propósito: daily_reports,
-- performance, reagendamento_casos — essas continuam existindo (histórico
-- de contestações/reagendamentos/faturas feitas e a comissão acumulada
-- continuam visíveis em Comissão/Dashboard, só não tem mais tela pra
-- registrar contestação nova).
--
-- CASCADE: se alguma view/função ainda depender dessas tabelas, o Postgres
-- avisa (ou remove junto, no caso de view) — confere o aviso que aparecer
-- depois de rodar, se algo inesperado for junto me avisa.
--
-- Roda no SQL Editor do Supabase. NÃO É REVERSÍVEL — os dados dessas
-- tabelas somem de vez.

drop table if exists public.contestacoes cascade;
drop table if exists public.contestacao_sheet_envios cascade;

drop function if exists public.submit_contestacao(text, text);
drop function if exists public.decide_contestacao(uuid, text, text);
drop function if exists public.sincronizar_contestacao_sheet(text[], text[]);

-- Config do módulo "contestacao" na planilha_modulos_config (fatura e
-- reagendamento continuam, só remove a linha desse módulo específico).
delete from public.planilha_modulos_config where modulo = 'contestacao';
