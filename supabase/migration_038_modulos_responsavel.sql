-- Painel BKO — migração: delegar módulos (Fatura / Contestação /
-- Reagendamento) pra cada BKO, só como etiqueta organizacional do
-- supervisor — não muda o que o BKO vê/acessa, é só uma lista.
-- Rode no SQL Editor do Supabase, depois da migração 037.

alter table public.profiles
  add column if not exists modulos_responsavel text[] not null default '{}';
