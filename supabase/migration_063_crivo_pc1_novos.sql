-- migration_063: PC 1 nos CNPJs novos, os outros PCs nos antigos
-- (17/11/2026, pedido do Brayan). Igual à migration_059 (um CNPJ por vez em
-- cada PC), só muda a ordem em que o 1º sistema pega da fila.

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
      -- 059: um CNPJ por vez em cada PC. Enquanto este PC tiver outro CNPJ
      -- em andamento (ainda no 1º ou já no 2º sistema), não pega um novo.
      and not exists (
        select 1 from public.crivo_consultas o
        where o.status = 'pendente' and o.pc = p_pc and o.id <> c.id
      )
      and public.crivo_pode_tentar_de_novo(c.pcs_tentados, c.pc_desde, p_pc)
      and not exists (
        select 1 from public.crivo_consultas o
        where o.status = 'pendente' and o.cnpj = c.cnpj and o.created_at < c.created_at
      )
    -- 063: o PC 1 pega primeiro os CNPJs mais NOVOS da fila; os outros
    -- PCs pegam os mais ANTIGOS. Assim quem acabou de mandar não espera a
    -- fila velha inteira.
    order by (c.pc = p_pc) desc nulls last,
             case when p_pc = 1 then -extract(epoch from c.created_at) else extract(epoch from c.created_at) end
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
      -- 059: CNPJ que veio de outro PC só entra aqui se este PC estiver livre.
      and (c.pc = p_pc or not exists (
        select 1 from public.crivo_consultas o
        where o.status = 'pendente' and o.pc = p_pc and o.id <> c.id
      ))
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
