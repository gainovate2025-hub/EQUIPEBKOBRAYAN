-- migration_066: erro de tela nunca aprova nem reprova (17/11/2026, pedido
-- do Brayan: "não pode reprovar nem aprovar, só tentar de novo em outro PC").
--
-- Erro de tela (página vazia, Bad Request, tela que não é Pré-Análise,
-- tela de lista, campo faltando que não resolve...) no 1º ou no 2º sistema:
-- vai pra outro PC livre; sem outro PC, tenta de novo no mesmo. Até 6 vezes.
-- Depois fica como "erro" (não reprova, o cadastro não barra).
-- "Leituras diferentes" só reprova quando as 2 leituras são Pré-Análises de
-- verdade e discordam (igual à 065). Substitui a 060/062/065.

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
  v_texto text;
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

  v_texto := lower(translate(coalesce(p_motivo, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'));

  -- 2º sistema: só aceita "aprovado" quando a análise diz "recomendado".
  if p_sistema = 2 and p_erro is null and p_resultado = 'aprovado' then
    if v_texto ~ '(temporariamente indisponivel|houve um problema|sessao encerrada|bad request)' then
      p_erro := '[2º sistema] ' || coalesce(nullif(trim(p_motivo), ''), 'falha no site');
    elsif v_texto !~ 'recomendado' or v_texto ~ 'nao recomendado' then
      p_resultado := 'reprovado';
    end if;
  end if;

  -- 1º sistema: só aceita "aprovado" quando é uma Pré-Análise de verdade.
  -- 065: tela que NÃO é Pré-Análise (Bad Request, "[object Object]",
  -- carregando...) não é leitura: vira erro e tenta de novo (até 3 vezes).
  -- Antes ela contava como "reprovado" e, com a outra leitura aprovada,
  -- dava "Leituras diferentes" e reprovava cliente sem restrição.
  if p_sistema = 1 and p_erro is null and p_resultado <> 'nao_encontrado' then
    if v_texto !~ 'pre-?analise de credito' then
      p_erro := '[1º sistema] a tela não mostrou a Pré-Análise: ' || left(coalesce(p_motivo, ''), 150);
    elsif p_resultado = 'aprovado' and v_texto ~ 'nao solicitada' then
      p_resultado := 'reprovado';
    end if;
  end if;

  -- 1º sistema: qualquer erro reprova na hora.
  -- 066 (Brayan): erro de tela NUNCA aprova nem reprova. Vai pra outro
  -- PC (ou tenta de novo no mesmo, se não tiver outro livre), até 6 vezes.
  -- Depois disso fica como "erro" (não conta como reprovado no cadastro).
  if p_erro is not null then
    insert into public.crivo_logs (consulta_id, numero_sistema, pc, tipo, mensagem)
    values (p_id, p_sistema, p_pc, 'erro', p_erro);
    if v.repasses < 6 then
      if public.crivo_devolver_pra_fila(p_id, 'erro de tela no ' || p_sistema || 'º sistema', 'repasse') then
        return 'repassado';
      end if;
      update public.crivo_consultas
      set repasses = repasses + 1,
          sistema1_travado_por = case when p_sistema = 1 then null else sistema1_travado_por end,
          sistema1_travado_em = case when p_sistema = 1 then null else sistema1_travado_em end,
          sistema2_travado_por = case when p_sistema = 2 then null else sistema2_travado_por end,
          sistema2_travado_em = case when p_sistema = 2 then null else sistema2_travado_em end,
          pc_desde = now()
      where id = p_id;
      insert into public.crivo_logs (consulta_id, numero_sistema, pc, tipo, mensagem)
      values (p_id, p_sistema, p_pc, 'repasse', format('Erro de tela: tentando de novo (%s/6)', v.repasses + 1));
      return 'repassado';
    end if;
    update public.crivo_consultas
    set status = 'erro', erro_mensagem = p_erro
    where id = p_id;
    return 'erro';
  end if;

  if p_sistema = 1 then
    -- 1ª leitura: guarda e manda o mesmo PC consultar de novo.
    if v.sistema1_leitura1 is null then
      update public.crivo_consultas
      set sistema1_leitura1 = p_resultado,
          sistema1_leitura1_motivo = p_motivo,
          sistema1_travado_por = null,
          sistema1_travado_em = null,
          pc_desde = now()
      where id = p_id;
      insert into public.crivo_logs (consulta_id, numero_sistema, pc, tipo, mensagem)
      values (p_id, 1, p_pc, 'info', format('1ª leitura: %s. Consultando de novo pra conferir.', p_resultado));
      return 'ok';
    end if;

    -- 2ª leitura: bateu, vale; não bateu, reprova.
    if p_resultado is distinct from v.sistema1_leitura1 then
      p_motivo := format('Leituras diferentes no 1º sistema: 1ª %s (%s) / 2ª %s (%s)',
        v.sistema1_leitura1, left(coalesce(v.sistema1_leitura1_motivo, ''), 150),
        p_resultado, left(coalesce(p_motivo, ''), 150));
      p_resultado := 'reprovado';
    end if;

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
