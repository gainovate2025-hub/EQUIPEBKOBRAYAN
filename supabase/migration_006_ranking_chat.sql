-- Painel BKO — migração: ranking por equipe + mini chat entre equipes
-- Rode no SQL Editor do Supabase, depois das migrações 001 a 005.
-- Seguro rodar mais de uma vez.

-- ---------- ver colegas de equipe (necessário pro ranking) ----------
-- Antes, um BKO só via a própria linha. Agora também vê profiles/performance
-- de quem está na mesma equipe (team_id igual) — só leitura, nunca escrita.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    auth.uid() = id
    or public.is_supervisor()
    or (team_id is not null and team_id = public.my_team_id())
  );

drop policy if exists performance_select on public.performance;
create policy performance_select on public.performance
  for select using (
    auth.uid() = user_id
    or public.is_supervisor()
    or exists (
      select 1 from public.profiles p
      where p.id = performance.user_id
        and p.team_id is not null
        and p.team_id = public.my_team_id()
    )
  );

-- ---------- CHAT ----------
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.team_messages enable row level security;

-- Leitura aberta a qualquer usuário autenticado — é bate-boca amigável entre
-- equipes, não dado sensível, e a ideia é dar pra ver a conversa da outra
-- equipe também (opção de "falar com a equipe do Isaque").
drop policy if exists team_messages_select on public.team_messages;
create policy team_messages_select on public.team_messages
  for select using (auth.role() = 'authenticated');

-- Sem policy de insert direta: toda escrita passa pela função abaixo, que
-- sempre usa o auth.uid() de quem chamou (nunca dá pra postar como outra
-- pessoa), mas permite escolher em qual equipe postar (inclusive a de fora).
create or replace function public.post_team_message(p_team_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
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

  insert into public.team_messages (team_id, user_id, message)
  values (p_team_id, auth.uid(), trim(p_message));
end;
$$;

grant execute on function public.post_team_message(uuid, text) to authenticated;
