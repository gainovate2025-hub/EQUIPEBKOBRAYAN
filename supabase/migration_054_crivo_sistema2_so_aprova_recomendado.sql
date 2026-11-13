-- migration_054: 2º sistema só aprova quando a análise de crédito diz
-- "RECOMENDADO" (13/11/2026, pedido do Brayan).
--
-- Problema: a extensão (até a 1.6.0) conta como APROVADO tudo o que o 2º
-- sistema mostra e que não cita retaguarda/negado/inadimplente. Assim, erros
-- do Easy Vendas viravam "Aprovado" no chat sem análise de crédito nenhuma.
-- Os casos mais comuns foram "O estado do endereço informado não pode ser
-- diferente do estado..." e "Telefone inválido".
--
-- A correção fica no banco, então não precisa trocar a extensão nos PCs.
-- Quando o 2º sistema manda "aprovado":
--   * falha passageira do site (serviço indisponível, sessão encerrada,
--     "houve um problema", bad request) vira ERRO. Aí vale a regra que já
--     existe: o CNPJ vai pra outro PC e, se não der, o chat avisa pra mandar
--     de novo;
--   * qualquer outro texto que não tenha "recomendado" (ou que diga "não
--     recomendado") vira REPROVADO, com o motivo original guardado;
--   * "recomendado" continua aprovado.
-- O resto da função é igual à migration_053.

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

  -- 2º sistema: só aceita "aprovado" quando a análise diz "recomendado".
  if p_sistema = 2 and p_erro is null and p_resultado = 'aprovado' then
    v_texto := lower(translate(coalesce(p_motivo, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'));
    if v_texto ~ '(temporariamente indisponivel|houve um problema|sessao encerrada|bad request)' then
      p_erro := '[2º sistema] ' || coalesce(nullif(trim(p_motivo), ''), 'falha no site');
    elsif v_texto !~ 'recomendado' or v_texto ~ 'nao recomendado' then
      p_resultado := 'reprovado';
    end if;
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
