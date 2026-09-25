-- Log passo a passo da extensão do Portal Parcelamento, gravado direto no
-- banco (mesmo esquema do crivo_logs) — assim dá pra diagnosticar o que
-- aconteceu de verdade sem pedir print do Console. Importante: abrir o
-- Console (F12) na aba do Portal ATRAPALHA a extensão (o Chrome só deixa
-- uma ferramenta de depuração por aba), então o diagnóstico tem que vir
-- daqui, não de lá.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create table if not exists public.parcelamento_logs (
  id bigserial primary key,
  origem text,
  custcode text,
  mensagem text not null,
  criado_em timestamptz not null default now()
);

create index if not exists parcelamento_logs_criado_em_idx on public.parcelamento_logs(criado_em desc);

alter table public.parcelamento_logs enable row level security;

-- A extensão (chave anon, sem login) só pode INSERIR.
drop policy if exists parcelamento_logs_insert on public.parcelamento_logs;
create policy parcelamento_logs_insert on public.parcelamento_logs
  for insert with check (true);

drop policy if exists parcelamento_logs_select on public.parcelamento_logs;
create policy parcelamento_logs_select on public.parcelamento_logs
  for select using (auth.role() = 'authenticated');
