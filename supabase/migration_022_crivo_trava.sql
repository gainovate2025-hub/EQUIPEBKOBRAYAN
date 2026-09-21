-- Trava (lock) por consulta+sistema, pra impedir que a MESMA consulta seja
-- processada duas vezes ao mesmo tempo (visto ao vivo: "consultando 2
-- vezes" — provavelmente duas abas abertas na mesma tela, ou uma aba que
-- recarregou e outra instância antiga que ainda não morreu, ambas
-- disputando a mesma consulta "pendente" sem nenhuma trava entre elas).
--
-- Cada aba gera um "client id" aleatório uma vez só quando carrega
-- (guardado em memória, não sobrevive reload de propósito). Antes de
-- processar uma consulta pendente, a aba tenta "reivindicar" ela — só
-- consegue se ninguém mais reivindicou ainda, se foi ELA MESMA quem já
-- tinha reivindicado antes (retry dentro da mesma aba continua
-- funcionando normal), ou se a trava está velha (+30s — cobre o caso de
-- uma aba ter travado uma consulta e depois travado/fechado sem soltar).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

alter table public.crivo_consultas add column if not exists sistema1_travado_por text;
alter table public.crivo_consultas add column if not exists sistema1_travado_em timestamptz;
alter table public.crivo_consultas add column if not exists sistema2_travado_por text;
alter table public.crivo_consultas add column if not exists sistema2_travado_em timestamptz;

create or replace function public.crivo_reivindicar(
  p_id uuid,
  p_numero_sistema int,
  p_client_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo_por text := format('sistema%s_travado_por', p_numero_sistema);
  v_campo_em text := format('sistema%s_travado_em', p_numero_sistema);
  v_linhas int;
begin
  if p_numero_sistema not in (1, 2) then
    raise exception 'numero de sistema invalido: %', p_numero_sistema;
  end if;

  execute format(
    'update public.crivo_consultas set %I = $2, %I = now() where id = $1 and status = ''pendente'' and (%I is null or %I = $2 or %I < now() - interval ''30 seconds'')',
    v_campo_por, v_campo_em, v_campo_por, v_campo_por, v_campo_em
  ) using p_id, p_client_id;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;

grant execute on function public.crivo_reivindicar(uuid, int, text) to anon;
