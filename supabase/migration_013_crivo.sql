-- Consulta do Crivo: supervisor/líder digita um CNPJ no site, uma extensão
-- de navegador (rodando nas telas do TIM) lê o resultado da pré-análise nos
-- dois sistemas e devolve aprovado/reprovado aqui.

create table if not exists public.crivo_consultas (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  solicitado_por uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'erro')),
  sistema1_resultado text check (sistema1_resultado in ('aprovado', 'reprovado')),
  sistema1_motivo text,
  sistema2_resultado text check (sistema2_resultado in ('aprovado', 'reprovado')),
  sistema2_motivo text,
  erro_mensagem text,
  created_at timestamptz not null default now(),
  concluido_at timestamptz
);

alter table public.crivo_consultas enable row level security;

-- Todo mundo autenticado da equipe (supervisor/líder) pode ver e criar
-- consultas — é uma ferramenta interna, sem dado sensível de cliente além
-- do CNPJ já visível nos sistemas do TIM.
--
-- A extensão do navegador (que lê as telas do TIM) NÃO faz login no site —
-- ela usa a chave pública (anon) direto. Por isso ela só pode ver/editar
-- consultas que ainda estão "pendente" (nunca mexe em algo já concluído).
drop policy if exists crivo_consultas_select on public.crivo_consultas;
create policy crivo_consultas_select on public.crivo_consultas
  for select using (auth.role() = 'authenticated' or status = 'pendente');

drop policy if exists crivo_consultas_insert on public.crivo_consultas;
create policy crivo_consultas_insert on public.crivo_consultas
  for insert with check (auth.role() = 'authenticated' and solicitado_por = auth.uid());

drop policy if exists crivo_consultas_update on public.crivo_consultas;
create policy crivo_consultas_update on public.crivo_consultas
  for update using (auth.role() = 'authenticated' or status = 'pendente');
