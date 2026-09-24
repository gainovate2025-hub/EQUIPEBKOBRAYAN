-- Portal Parcelamento — recomeço: em vez de nomes de coluna fixos no
-- Apps Script, agora o supervisor escolhe pelo site o nome de CADA
-- coluna usada (Custcode, E-mail, Telefone, e onde escrever o status de
-- "enviado"). Faz a extensão funcionar em planilhas com cabeçalhos
-- diferentes sem precisar editar código.

alter table public.parcelamento_config
  add column if not exists coluna_custcode text not null default 'CUSTCODE',
  add column if not exists coluna_email text not null default 'EMAIL',
  add column if not exists coluna_telefone text not null default 'TELEFONE',
  add column if not exists coluna_status text not null default 'DATA DA FATURA';
