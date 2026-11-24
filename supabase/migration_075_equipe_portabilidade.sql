-- Equipe de PORTABILIDADE (pedido do Brayan em 24/11/2026: a equipe do
-- Isaque é de portabilidade, não de contestação; o SIM estava subindo como
-- contestação). Cada equipe passa a ter um "tipo":
--   * contestacao   (padrão) → site como sempre foi;
--   * portabilidade → o site troca "Contestações" por "Portabilidades (SIM)"
--     e esconde Reagendamentos, Faturas, Comprovantes, CustCodes,
--     Automações, Consulta CNPJ e Desempenho de vendas.
-- O SIM continua contando no mesmo lugar e valendo R$ 2 na comissão.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.teams
  add column if not exists tipo text not null default 'contestacao';

alter table public.teams drop constraint if exists teams_tipo_check;
alter table public.teams add constraint teams_tipo_check
  check (tipo in ('contestacao', 'portabilidade'));

update public.teams
set tipo = 'portabilidade',
    contestacao_label = 'Portabilidades (SIM)'
where name ilike '%isaque%';

-- Confere: tem que aparecer a equipe do Isaque com tipo "portabilidade".
select name, tipo, contestacao_label from public.teams order by name;
