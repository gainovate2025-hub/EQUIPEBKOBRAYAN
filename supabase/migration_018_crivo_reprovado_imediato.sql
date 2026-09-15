-- Crivo: se QUALQUER um dos dois sistemas reprovar, fecha a consulta na
-- hora (não espera o outro sistema responder) — reprovado é decisivo,
-- não precisa de confirmação dos dois lados.
-- Antes só fechava (status = 'concluido') quando os DOIS já tinham
-- respondido, mesmo que o primeiro já tivesse reprovado.
-- Rode no SQL Editor do Supabase, depois da migration_017. Seguro rodar
-- mais de uma vez.

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
  v_deve_concluir boolean;
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

  -- reprovado é decisivo por si só — fecha na hora, não espera o outro lado
  v_deve_concluir := v_ja_tem_outro or (p_resultado = 'reprovado');

  execute format(
    'update public.crivo_consultas set %I = $1, %I = $2, status = case when $3 then ''concluido'' else status end, concluido_at = case when $3 then now() else concluido_at end where id = $4 and status = ''pendente''',
    v_campo_resultado, v_campo_motivo
  ) using p_resultado, p_motivo, v_deve_concluir, p_id;
end;
$$;

grant execute on function public.crivo_salvar_resultado(uuid, int, text, text, text) to anon;
