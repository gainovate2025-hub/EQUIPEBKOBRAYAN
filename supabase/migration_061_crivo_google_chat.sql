-- migration_061: casos do Google Chat "PEDIDOS TIM EMPRESAS." pra comparar
-- com o nosso Crivo (16/11/2026, pedido do Brayan).
--
-- Uma extensão pequena (extensao-leitor-gchat) lê o chat aberto no Chrome:
-- cada resposta lá cita o CNPJ e diz APROVADO/REPROVADO. Ela grava aqui
-- pela função crivo_gchat_registrar (chave anon). Na 1ª vez que um CNPJ
-- aparece no dia, ele também entra na fila do nosso Crivo (login op051),
-- pra comparar as respostas na aba "Comparar com Google Chat".

create table if not exists public.crivo_gchat (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  resposta text not null,
  texto text,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  capturado_em timestamptz not null default now(),
  consulta_id uuid references public.crivo_consultas(id) on delete set null,
  unique (cnpj, dia)
);

alter table public.crivo_gchat enable row level security;
drop policy if exists crivo_gchat_select on public.crivo_gchat;
create policy crivo_gchat_select on public.crivo_gchat
  for select using (auth.role() = 'authenticated');

create or replace function public.crivo_gchat_registrar(p_cnpj text, p_resposta text, p_texto text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_resp text := upper(trim(coalesce(p_resposta, '')));
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_existe public.crivo_gchat;
  v_consulta uuid;
  v_quem uuid;
begin
  if length(v_cnpj) <> 14 or v_resp = '' then
    return 'ignorado';
  end if;

  select * into v_existe from public.crivo_gchat where cnpj = v_cnpj and dia = v_dia;
  if found then
    if v_existe.resposta is distinct from v_resp then
      update public.crivo_gchat set resposta = v_resp, texto = left(p_texto, 500) where id = v_existe.id;
      return 'atualizado';
    end if;
    return 'ja_tinha';
  end if;

  select id into v_quem from public.profiles where username = 'op051';
  if v_quem is not null then
    insert into public.crivo_consultas (cnpj, solicitado_por)
    values (v_cnpj, v_quem)
    returning id into v_consulta;
  end if;

  insert into public.crivo_gchat (cnpj, resposta, texto, dia, consulta_id)
  values (v_cnpj, v_resp, left(p_texto, 500), v_dia, v_consulta);
  return 'novo';
end;
$$;

revoke all on function public.crivo_gchat_registrar(text, text, text) from public;
grant execute on function public.crivo_gchat_registrar(text, text, text) to anon, authenticated;
