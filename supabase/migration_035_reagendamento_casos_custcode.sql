-- Reagendamento volta a ser fila de casos (supervisor manda CNPJ pro BKO
-- fazer), agora com CustCode junto — pra quando o caso vencer (9 dias sem
-- concluir) o BKO ver o CustCode certo na hora de refazer.

alter table public.reagendamento_casos
  add column if not exists custcode text not null default '';

drop function if exists public.adicionar_reagendamento_caso(uuid, text, text);

create or replace function public.adicionar_reagendamento_caso(p_bko_id uuid, p_cnpj text, p_razao_social text, p_custcode text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_team uuid;
  v_allowed boolean;
begin
  if trim(coalesce(p_cnpj, '')) = '' or trim(coalesce(p_razao_social, '')) = '' then
    raise exception 'Informe o CNPJ e a Razão Social.';
  end if;

  select team_id into v_target_team from public.profiles where id = p_bko_id and role = 'bko';
  if v_target_team is null and not exists (select 1 from public.profiles where id = p_bko_id and role = 'bko') then
    raise exception 'BKO não encontrado.';
  end if;

  v_allowed := public.is_supervisor() or (
    public.is_lider() and v_target_team is not null and v_target_team = public.my_team_id()
  );
  if not v_allowed then
    raise exception 'Sem permissão para mandar caso pra esse BKO.';
  end if;

  insert into public.reagendamento_casos (bko_id, cnpj, razao_social, custcode, criado_por)
  values (p_bko_id, trim(p_cnpj), trim(p_razao_social), trim(coalesce(p_custcode, '')), auth.uid());
end;
$$;

grant execute on function public.adicionar_reagendamento_caso(uuid, text, text, text) to authenticated;
