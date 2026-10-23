-- RASCUNHO — projeto "Consulta CNPJ + Venda" (23/10/2026): a operação
-- digita o CNPJ do cliente, o site busca os dados automaticamente (API
-- pública do cnpj.ws) e mostra botões "Venda feita"/"Venda não feita".
-- Em "Venda feita" abre um formulário (quantidade de linhas, números,
-- nova/portabilidade, plano, titular) e depois de salvar mostra a ficha
-- inteira com botão de copiar em cada campo, pra colar no sistema de
-- cadastro de verdade.
--
-- É RASCUNHO: campos e regras ainda vão mudar quando o Brayan passar as
-- informações reais. Rode no SQL Editor do Supabase. Seguro rodar mais de
-- uma vez.

create table if not exists public.vendas_cnpj (
  id uuid primary key default gen_random_uuid(),

  cnpj text not null,
  razao_social text,
  nome_fantasia text,
  endereco text,
  telefone text,
  email text,

  status text not null default 'venda_nao_feita' check (status in ('venda_feita', 'venda_nao_feita')),

  -- Só preenchido quando status = 'venda_feita'.
  quantidade_linhas int,
  numeros_linhas text,
  tipo_linha text check (tipo_linha in ('nova', 'portabilidade')),
  plano text,
  titular_linha text,

  solicitado_por uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.vendas_cnpj enable row level security;

drop policy if exists vendas_cnpj_select on public.vendas_cnpj;
create policy vendas_cnpj_select on public.vendas_cnpj
  for select using (auth.role() = 'authenticated');

drop policy if exists vendas_cnpj_insert on public.vendas_cnpj;
create policy vendas_cnpj_insert on public.vendas_cnpj
  for insert with check (auth.role() = 'authenticated' and solicitado_por = auth.uid());
