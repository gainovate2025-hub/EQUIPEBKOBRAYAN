-- A trava entre abas (migration_022) soltava uma consulta como "abandonada"
-- depois de só 30 segundos sem atualização. Com 3 pessoas usando o Crivo ao
-- mesmo tempo (29/10/2026), o EasyVendas ficou mais lento pra responder e
-- processar uma consulta de verdade passou a demorar mais que isso — nesse
-- meio-tempo, outra aba via a trava como "velha" e reivindicava a MESMA
-- consulta pendente, processando ela de novo (mandando o mesmo CNPJ
-- duas vezes, visto ao vivo). Sobe esse limite de 30s pra 2 minutos — tempo
-- de sobra mesmo com o timeout da extensão agora em 90s (easyvendas.js),
-- mas ainda recupera uma consulta de uma aba travada/fechada sem soltar.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

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
    'update public.crivo_consultas set %I = $2, %I = now() where id = $1 and status = ''pendente'' and (%I is null or %I = $2 or %I < now() - interval ''2 minutes'')',
    v_campo_por, v_campo_em, v_campo_por, v_campo_por, v_campo_em
  ) using p_id, p_client_id;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;

grant execute on function public.crivo_reivindicar(uuid, int, text) to anon;
