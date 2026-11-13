-- migration_057: qualquer erro no 1º sistema vira REPROVADO
-- (13/11/2026, pedido do Brayan: "se ele der qualquer erro no primeiro ele
-- tem que reprovar").
--
-- Antes, um erro no 1º sistema (não achou o campo, não viu resposta a
-- tempo, formulário incompleto etc.) mandava o CNPJ pra outro PC e, sem
-- outro PC, mostrava "Erro" no chat. Agora o erro do 1º sistema já fecha o
-- CNPJ como REPROVADO na hora, sem 2ª leitura e sem passar pro 2º sistema.
-- O motivo guarda o texto do erro.
--
-- Continua igual: as 2 leituras, "na dúvida reprova" e as regras do 2º
-- sistema (migration_056). Erro no 2º sistema continua indo pra outro PC.
-- O limite de 30s do 1º sistema (migration_055) também continua mandando
-- pra outro PC, porque demorar não é erro.
-- Precisa ter rodado a migration_056 antes (ela cria as colunas usadas aqui).

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
  if p_sistema = 1 and p_erro is null and p_resultado = 'aprovado' then
    if v_texto !~ 'pre-?analise de credito' or v_texto ~ 'nao solicitada' then
      p_resultado := 'reprovado';
    end if;
  end if;

  -- 1º sistema: qualquer erro reprova na hora.
  if p_sistema = 1 and p_erro is not null then
    insert into public.crivo_logs (consulta_id, numero_sistema, pc, tipo, mensagem)
    values (p_id, 1, p_pc, 'erro', p_erro);
    update public.crivo_consultas
    set sistema1_resultado = 'reprovado',
        sistema1_motivo = 'Erro no 1º sistema: ' || p_erro,
        status = 'concluido',
        concluido_at = now()
    where id = p_id;
    return 'ok';
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
