-- Painel BKO — migração: corrige nome do remetente em mensagens entre equipes
-- Antes, o nome vinha de um JOIN em profiles, que agora é bloqueado pelo RLS
-- quando o remetente é de outra equipe. Guardamos o nome direto na mensagem.
-- Rode no SQL Editor do Supabase, depois da migração 006.

alter table public.team_messages add column if not exists user_name text;

update public.team_messages tm
set user_name = p.name
from public.profiles p
where p.id = tm.user_id and tm.user_name is null;

alter table public.team_messages alter column user_name set not null;

create or replace function public.post_team_message(p_team_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.profiles where id = auth.uid();

  if v_name is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if trim(p_message) = '' then
    raise exception 'Mensagem vazia.';
  end if;

  if length(p_message) > 500 then
    raise exception 'Mensagem muito longa (máximo 500 caracteres).';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'Equipe inválida.';
  end if;

  insert into public.team_messages (team_id, user_id, user_name, message)
  values (p_team_id, auth.uid(), v_name, trim(p_message));
end;
$$;
