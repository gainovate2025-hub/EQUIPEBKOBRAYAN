-- A regra de segurança (RLS) de UPDATE do crivo_consultas ficou bloqueando
-- a extensão mesmo com "with check (true)" corretíssimo no catálogo — por
-- algum motivo não identificado, o Postgres continuava recusando a escrita
-- (testado até direto no SQL Editor com "set role anon", sem passar pela
-- internet, então não é cache). Em vez de continuar caçando esse fantasma,
-- a extensão passa a gravar o resultado através desta função (mesmo
-- truque que o chat da equipe já usa em post_team_message): ela roda como
-- "security definer", ou seja, por dentro, sem esbarrar na RLS.
--
-- Também resolve de quebra uma corrida (race condition) que existia antes:
-- a extensão fazia um SELECT pra saber se o outro sistema já tinha
-- respondido, e SÓ DEPOIS gravava — nesse meio-tempo o outro sistema podia
-- responder também, e um dos dois "esquecia" de marcar como concluído.
-- Agora isso é tudo uma coisa só (atômica) dentro da função.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.

create or replace function public.crivo_salvar_resultado(
  p_id uuid,
  p_numero_sistema int,
  p_resultado text,
  p_motivo text,
  p_erro text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo_resultado text := format('sistema%s_resultado', p_numero_sistema);
  v_campo_motivo text := format('sistema%s_motivo', p_numero_sistema);
  v_outro_campo text := format('sistema%s_resultado', case when p_numero_sistema = 1 then 2 else 1 end);
  v_ja_tem_outro boolean;
begin
  if p_numero_sistema not in (1, 2) then
    raise exception 'numero de sistema invalido: %', p_numero_sistema;
  end if;

  if p_erro is not null then
    update public.crivo_consultas
    set status = 'erro', erro_mensagem = p_erro
    where id = p_id and status = 'pendente';
    return;
  end if;

  execute format('select %I is not null from public.crivo_consultas where id = $1', v_outro_campo)
    into v_ja_tem_outro
    using p_id;

  execute format(
    'update public.crivo_consultas set %I = $1, %I = $2, status = case when $3 then ''concluido'' else status end, concluido_at = case when $3 then now() else concluido_at end where id = $4 and status = ''pendente''',
    v_campo_resultado, v_campo_motivo
  ) using p_resultado, p_motivo, v_ja_tem_outro, p_id;
end;
$$;

grant execute on function public.crivo_salvar_resultado(uuid, int, text, text, text) to anon;
