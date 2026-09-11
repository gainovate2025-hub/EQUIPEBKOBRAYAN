-- Painel BKO — migração: comissão automática
-- Regra: R$ 1,00 por reagendamento + R$ 2,00 por contestação/Sim Portabilidade.
-- A comissão deixa de ser editável manualmente — passa a ser sempre calculada
-- a partir de contestations_done e rescheduling_done.
-- Rode no SQL Editor do Supabase, depois das migrações 001/002/003.

alter table public.performance drop column if exists commission;

alter table public.performance
  add column commission numeric(12,2)
  generated always as (contestations_done * 2 + rescheduling_done * 1) stored;
