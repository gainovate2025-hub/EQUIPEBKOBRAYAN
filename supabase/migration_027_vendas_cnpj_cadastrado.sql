-- Rascunho "Consulta CNPJ + Venda": marca se a venda já foi cadastrada
-- no sistema de verdade, pra sumir da fila de pendentes — e permite
-- autenticado atualizar isso (só tinha select/insert até agora).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.vendas_cnpj add column if not exists cadastrado boolean not null default false;
alter table public.vendas_cnpj add column if not exists cadastrado_em timestamptz;

drop policy if exists vendas_cnpj_update on public.vendas_cnpj;
create policy vendas_cnpj_update on public.vendas_cnpj
  for update using (auth.role() = 'authenticated');
