-- Crivo: além de aprovado/reprovado, o resultado de um sistema agora pode
-- ser "nao_encontrado" (o CNPJ não existe naquele sistema — a extensão
-- reconhece isso na hora, em vez de tentar classificar como aprovado ou
-- ficar 12s esperando uma mudança de tela que nunca vem).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.crivo_consultas drop constraint if exists crivo_consultas_sistema1_resultado_check;
alter table public.crivo_consultas add constraint crivo_consultas_sistema1_resultado_check
  check (sistema1_resultado in ('aprovado', 'reprovado', 'nao_encontrado'));

alter table public.crivo_consultas drop constraint if exists crivo_consultas_sistema2_resultado_check;
alter table public.crivo_consultas add constraint crivo_consultas_sistema2_resultado_check
  check (sistema2_resultado in ('aprovado', 'reprovado', 'nao_encontrado'));
