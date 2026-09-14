-- Corrige a política de UPDATE da migration_013: ela só tinha "using" (que
-- checa a linha ANTES de editar), sem "with check" — e o Postgres, nesse
-- caso, reaproveita o "using" pra checar a linha DEPOIS de editar também.
-- Resultado: a extensão (chave anon, sem login) conseguia pegar uma
-- consulta pendente, mas era barrada bem na hora de salvar o resultado
-- (aprovado/reprovado/erro), porque isso muda o status pra "concluido" ou
-- "erro" — e "status = 'pendente'" deixava de bater. Por isso o 2º sistema
-- nunca conseguia salvar nada (ficava tentando de novo a cada 5s, sempre
-- falhando) — e o 1º ia dar o mesmo problema assim que precisasse fechar
-- (marcar concluido) uma consulta.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

drop policy if exists crivo_consultas_update on public.crivo_consultas;
create policy crivo_consultas_update on public.crivo_consultas
  for update
  using (auth.role() = 'authenticated' or status = 'pendente')
  with check (true);
