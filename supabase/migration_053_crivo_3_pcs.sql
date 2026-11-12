-- Crivo com 3 PCs (12/11/2026).
--
-- Cada PC (1, 2 ou 3, escolhido no ícone da extensão) tem duas abas do
-- Easy Vendas: o 1º sistema (cliente) e o 2º sistema (negociação). A
-- operação manda o CNPJ no chat, ele cai na FILA e o primeiro PC livre
-- pega. Aquele PC faz o CNPJ do começo ao fim na própria máquina.
--
-- Regras:
-- * Um PC só pega CNPJ se os DOIS sistemas dele estiverem conectados
--   (cada aba avisa o banco a cada 5s; 30s sem aviso = desconectado).
-- * Se um sistema demorar mais de 1m50 (ou o PC cair), o CNPJ vai pra
--   outro PC conectado, sem mostrar erro no chat.
-- * Se der erro num PC, também tenta em outro PC. Só mostra erro no chat
--   quando não tem outro PC conectado ou o CNPJ já trocou de PC 3 vezes.
-- * Tudo isso fica registrado em crivo_logs (pc, tipo) pra aba "Log".
--
-- Rode no SQL Editor do Supabase DEPOIS da 052. Seguro rodar mais de uma vez.

-- 1) Quem está conectado -------------------------------------------------
create table if not exists public.crivo_pcs (
  pc int not null check (pc between 1 and 3),
  sistema int not null check (sistema in (1, 2)),
  client_id text,
  url text,
  consulta_id uuid,
  visto_em timestamptz not null default now(),
  primary key (pc, sistema)
);

alter table public.crivo_pcs enable row level security;

drop policy if exists crivo_pcs_select on public.crivo_pcs;
create policy crivo_pcs_select on public.crivo_pcs
  for select using (auth.role() = 'authenticated');

-- 2) Colunas novas -------------------------------------------------------
alter table public.crivo_consultas add column if not exists pc int;
alter table public.crivo_consultas add column if not exists pc_desde timestamptz;
alter table public.crivo_consultas add column if not exists pcs_tentados int[] not null default '{}';
alter table public.crivo_consultas add column if not exists repasses int not null default 0;

alter table public.crivo_logs add column if not exists pc int;
alter table public.crivo_logs add column if not exists tipo text not null default 'info';

create index if not exists crivo_logs_criado_em_idx on public.crivo_logs (criado_em desc);
create index if not exists crivo_consultas_pendentes_idx on public.crivo_consultas (created_at) where status = 'pendente';

-- 3) PC conectado = os dois sistemas deram sinal nos últimos 30s ----------
create or replace function public.crivo_pc_online(p_pc int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) = 2
  from public.crivo_pcs
  where pc = p_pc and visto_em > now() - interval '30 seconds';
$$;

-- Status dos 3 PCs (o ícone da extensão e a aba Log usam isso).
create or replace function public.crivo_status_pcs()
returns table (pc int, sistema int, conectado boolean, visto_em timestamptz, consulta_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.pc, s.sistema,
         coalesce(x.visto_em > now() - interval '30 seconds', false),
         x.visto_em,
         x.consulta_id
  from generate_series(1, 3) as p(pc)
  cross join generate_series(1, 2) as s(sistema)
  left join public.crivo_pcs x on x.pc = p.pc and x.sistema = s.sistema
  order by p.pc, s.sistema;
$$;

grant execute on function public.crivo_status_pcs() to anon, authenticated;

-- 4) Sinal de vida de cada aba (a cada 5s) --------------------------------
create or replace function public.crivo_sinal(
  p_pc int,
  p_sistema int,
  p_client_id text,
  p_url text,
  p_consulta_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pc not between 1 and 3 or p_sistema not in (1, 2) then
    raise exception 'pc/sistema invalido: %/%', p_pc, p_sistema;
  end if;
  insert into public.crivo_pcs (pc, sistema, client_id, url, consulta_id, visto_em)
  values (p_pc, p_sistema, p_client_id, left(p_url, 300), p_consulta_id, now())
  on conflict (pc, sistema) do update
    set client_id = excluded.client_id, url = excluded.url,
        consulta_id = excluded.consulta_id, visto_em = now();
end;
$$;

grant execute on function public.crivo_sinal(int, int, text, text, uuid) to anon;

-- 5) Tira o CNPJ de um PC e devolve pra fila ------------------------------
-- Só repassa se existir OUTRO PC conectado, e no máximo 3 vezes por CNPJ
-- (pra não ficar pulando de PC em PC pra sempre). Quem ainda não tentou
-- tem preferência (veja crivo_pegar). Devolve true se repassou.
create or replace function public.crivo_devolver_pra_fila(p_id uuid, p_motivo text, p_tipo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.crivo_consultas;
begin
  select * into v from public.crivo_consultas where id = p_id and status = 'pendente' for update;
  if not found or v.pc is null then
    return false;
  end if;

  if v.repasses >= 3 or not exists (
    select 1 from generate_series(1, 3) as o(pc)
    where o.pc <> v.pc and public.crivo_pc_online(o.pc)
  ) then
    return false;
  end if;

  update public.crivo_consultas
  set pcs_tentados = array_append(pcs_tentados, v.pc),
      pc = null,
      pc_desde = now(),
      repasses = repasses + 1,
      -- o 1º sistema já aprovou? Guarda isso e só refaz o 2º.
      sistema1_travado_por = case when sistema1_resultado is null then null else sistema1_travado_por end,
      sistema1_travado_em = case when sistema1_resultado is null then null else sistema1_travado_em end,
      sistema2_travado_por = null,
      sistema2_travado_em = null
  where id = p_id;

  insert into public.crivo_logs (consulta_id, numero_sistema, pc, tipo, mensagem)
  values (p_id, case when v.sistema1_resultado is null then 1 else 2 end, v.pc, p_tipo,
          format('Saiu do PC %s e voltou pra fila: %s', v.pc, p_motivo));
  return true;
end;
$$;

-- 6) Vigia: CNPJ parado há mais de 1m50 num PC, ou PC que caiu ------------
create or replace function public.crivo_vigiar_atrasadas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  for v in
    select id, pc, pc_desde from public.crivo_consultas
    where status = 'pendente' and pc is not null
      and (pc_desde < now() - interval '110 seconds' or not public.crivo_pc_online(pc))
  loop
    perform public.crivo_devolver_pra_fila(
      v.id,
      case when public.crivo_pc_online(v.pc) then 'demorou mais de 1m50 pra responder'
           else 'o PC desconectou (um dos sistemas parou de dar sinal)' end,
      'repasse'
    );
  end loop;
end;
$$;

-- 7a) Um PC que já tentou esse CNPJ pode pegar de novo?
-- * Nunca tentou: pode.
-- * Passaram 20s desde que voltou pra fila e ninguém pegou: pode.
-- * Foi o ÚLTIMO a falhar: espera os 20s (dá a vez pro outro PC).
-- * Tentou antes, mas não foi o último, e não tem PC conectado que ainda
--   não tentou: pode na hora.
create or replace function public.crivo_pode_tentar_de_novo(p_tentados int[], p_desde timestamptz, p_pc int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not (p_pc = any(p_tentados))
      or p_desde < now() - interval '20 seconds'
      or (p_tentados[array_length(p_tentados, 1)] <> p_pc
          and not exists (select 1 from generate_series(1, 3) as o(pc)
                          where not (o.pc = any(p_tentados)) and public.crivo_pc_online(o.pc)));
$$;

-- 7) Pegar o próximo CNPJ da fila ----------------------------------------
-- 1º sistema: CNPJ novo (sem PC) ou um que já é deste PC.
-- 2º sistema: CNPJ que este PC aprovou no 1º (ou que voltou pra fila
--             depois do 1º já aprovado).
-- Quem já tentou e falhou espera a vez (veja crivo_pode_tentar_de_novo).
create or replace function public.crivo_pegar(p_pc int, p_sistema int, p_client_id text)
returns setof public.crivo_consultas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_pc not between 1 and 3 or p_sistema not in (1, 2) then
    raise exception 'pc/sistema invalido: %/%', p_pc, p_sistema;
  end if;

  perform public.crivo_vigiar_atrasadas();

  -- PC sem os dois sistemas conectados não pega nada.
  if not public.crivo_pc_online(p_pc) then
    return;
  end if;

  if p_sistema = 1 then
    select c.id into v_id
    from public.crivo_consultas c
    where c.status = 'pendente'
      and c.sistema1_resultado is null
      and (c.pc is null or c.pc = p_pc)
      and (c.sistema1_travado_por is null or c.sistema1_travado_por = p_client_id
           or c.sistema1_travado_em < now() - interval '2 minutes')
      and public.crivo_pode_tentar_de_novo(c.pcs_tentados, c.pc_desde, p_pc)
      and not exists (
        select 1 from public.crivo_consultas o
        where o.status = 'pendente' and o.cnpj = c.cnpj and o.created_at < c.created_at
      )
    order by (c.pc = p_pc) desc nulls last, c.created_at
    limit 1
    for update of c skip locked;

    if v_id is null then return; end if;

    return query
    update public.crivo_consultas
    set pc_desde = case when pc is distinct from p_pc then now() else pc_desde end,
        pc = p_pc,
        sistema1_travado_por = p_client_id,
        sistema1_travado_em = now()
    where id = v_id
    returning *;
  else
    select c.id into v_id
    from public.crivo_consultas c
    where c.status = 'pendente'
      and c.sistema1_resultado = 'aprovado'
      and c.sistema2_resultado is null
      and (c.pc is null or c.pc = p_pc)
      and (c.sistema2_travado_por is null or c.sistema2_travado_por = p_client_id
           or c.sistema2_travado_em < now() - interval '2 minutes')
      and public.crivo_pode_tentar_de_novo(c.pcs_tentados, c.pc_desde, p_pc)
      and not exists (
        select 1 from public.crivo_consultas o
        where o.status = 'pendente' and o.cnpj = c.cnpj and o.created_at < c.created_at
      )
    order by (c.pc = p_pc) desc nulls last, c.created_at
    limit 1
    for update of c skip locked;

    if v_id is null then return; end if;

    return query
    update public.crivo_consultas
    set pc_desde = case when pc is distinct from p_pc or sistema2_travado_por is distinct from p_client_id
                        then now() else pc_desde end,
        pc = p_pc,
        sistema2_travado_por = p_client_id,
        sistema2_travado_em = now()
    where id = v_id
    returning *;
  end if;
end;
$$;

grant execute on function public.crivo_pegar(int, int, text) to anon;

-- 8) Renovar a reserva (a cada 30s enquanto processa) --------------------
-- Devolve false se o CNPJ já não é mais deste PC (foi repassado) — aí a
-- extensão larga ele e não grava nada.
create or replace function public.crivo_renovar(p_id uuid, p_pc int, p_sistema int, p_client_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas int;
begin
  if p_sistema = 1 then
    update public.crivo_consultas set sistema1_travado_em = now()
    where id = p_id and status = 'pendente' and pc = p_pc and sistema1_travado_por = p_client_id;
  else
    update public.crivo_consultas set sistema2_travado_em = now()
    where id = p_id and status = 'pendente' and pc = p_pc and sistema2_travado_por = p_client_id;
  end if;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;

grant execute on function public.crivo_renovar(uuid, int, int, text) to anon;

-- 9) Gravar o resultado ---------------------------------------------------
-- Só grava se o CNPJ ainda for deste PC/aba. Erro: tenta outro PC antes
-- de mostrar erro no chat.
create or replace function public.crivo_salvar_resultado_pc(
  p_id uuid,
  p_pc int,
  p_sistema int,
  p_client_id text,
  p_resultado text,
  p_motivo text,
  p_erro text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.crivo_consultas;
  v_dono text;
  v_concluir boolean;
begin
  if p_sistema not in (1, 2) then
    raise exception 'numero de sistema invalido: %', p_sistema;
  end if;

  select * into v from public.crivo_consultas where id = p_id and status = 'pendente' for update;
  if not found then return 'ignorado'; end if;
  v_dono := case when p_sistema = 1 then v.sistema1_travado_por else v.sistema2_travado_por end;
  if v.pc is distinct from p_pc or v_dono is distinct from p_client_id then
    return 'ignorado'; -- já foi repassado pra outro PC
  end if;

  if p_erro is not null then
    insert into public.crivo_logs (consulta_id, numero_sistema, pc, tipo, mensagem)
    values (p_id, p_sistema, p_pc, 'erro', p_erro);
    if public.crivo_devolver_pra_fila(p_id, 'deu erro no ' || p_sistema || 'º sistema', 'repasse') then
      return 'repassado';
    end if;
    update public.crivo_consultas
    set status = 'erro', erro_mensagem = p_erro
    where id = p_id;
    return 'erro';
  end if;

  if p_sistema = 1 then
    v_concluir := p_resultado in ('reprovado', 'nao_encontrado');
    update public.crivo_consultas
    set sistema1_resultado = p_resultado,
        sistema1_motivo = p_motivo,
        pc_desde = now(), -- começa a contar o 1m50 do 2º sistema
        status = case when v_concluir then 'concluido' else status end,
        concluido_at = case when v_concluir then now() else concluido_at end
    where id = p_id;
  else
    update public.crivo_consultas
    set sistema2_resultado = p_resultado,
        sistema2_motivo = p_motivo,
        status = 'concluido',
        concluido_at = now()
    where id = p_id;
  end if;
  return 'ok';
end;
$$;

grant execute on function public.crivo_salvar_resultado_pc(uuid, int, int, text, text, text, text) to anon;

-- Essas duas são só de uso interno (chamadas pelas funções acima).
revoke execute on function public.crivo_devolver_pra_fila(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.crivo_vigiar_atrasadas() from public, anon, authenticated;
