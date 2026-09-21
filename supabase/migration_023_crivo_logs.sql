-- Log detalhado de cada consulta do Crivo, gravado direto no banco (não
-- só no console do navegador) — assim, quando der erro, dá pra consultar
-- aqui e ver o passo a passo exato que a extensão fez, sem precisar pedir
-- print + console pra quem estava testando.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create table if not exists public.crivo_logs (
  id bigserial primary key,
  consulta_id uuid references public.crivo_consultas(id) on delete cascade,
  numero_sistema int,
  mensagem text not null,
  criado_em timestamptz not null default now()
);

create index if not exists crivo_logs_consulta_id_idx on public.crivo_logs(consulta_id);

alter table public.crivo_logs enable row level security;

-- A extensão (chave anon, sem login) só pode INSERIR — nunca ler nem
-- apagar log de ninguém. Quem vê os logs é a equipe autenticada (pra eu
-- conseguir consultar via SQL Editor quando precisar diagnosticar).
drop policy if exists crivo_logs_insert on public.crivo_logs;
create policy crivo_logs_insert on public.crivo_logs
  for insert with check (true);

drop policy if exists crivo_logs_select on public.crivo_logs;
create policy crivo_logs_select on public.crivo_logs
  for select using (auth.role() = 'authenticated');

-- View pronta pra diagnosticar rápido: junta o log com o CNPJ da
-- consulta, mais recente primeiro. Uso típico — ver o log da ÚLTIMA
-- consulta que rodou:
--   select * from public.crivo_logs_recentes
--   where cnpj = (select cnpj from public.crivo_logs_recentes limit 1)
--   order by criado_em asc;
create or replace view public.crivo_logs_recentes as
select l.criado_em, l.numero_sistema, c.cnpj, l.mensagem, l.consulta_id
from public.crivo_logs l
join public.crivo_consultas c on c.id = l.consulta_id
order by l.criado_em desc;
