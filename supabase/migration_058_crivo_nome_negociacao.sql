-- migration_058: nome da negociação pra religar o 2º sistema (15/11/2026,
-- pedido do Brayan).
--
-- Quando o 2º sistema trava ou cai na tela de termos, a extensão (1.6.4)
-- clica em Negociações, procura esse nome no campo Razão Social, abre a
-- negociação e clica em EDITAR, voltando pra tela da 1ª venda. O
-- supervisor escolhe o nome no Crivo (Configurações). Ex: WILL CRIVO 04NOV.

alter table public.crivo_configuracoes
  add column if not exists negociacao_nome text;
