-- Faltava a coluna que diz QUEM é o responsável pela linha (vendedor) —
-- é o que decide o que cada BKO vê na tela de Faturas (só as linhas
-- dele), diferente do supervisor que vê tudo.

alter table public.faturas_config
  add column if not exists coluna_vendedor text not null default 'VENDEDOR';
