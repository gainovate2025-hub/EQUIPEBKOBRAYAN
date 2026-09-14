-- Painel BKO — migração: papel "operacao"
-- Login enxuto (só Consulta Crivo + Chat) pra quem fica pedindo consulta de
-- CNPJ no dia a dia, sem acesso ao resto do painel (comissão, contestação
-- etc). Usa o mesmo chat por equipe que já existe — só precisa de uma
-- equipe "Operação" pra ter uma casa (dá pra falar com as outras equipes
-- normalmente, como qualquer time já faz hoje).
-- Rode no SQL Editor do Supabase, depois das migrações 001 a 013.
-- Seguro rodar mais de uma vez.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('supervisor', 'bko', 'lider', 'operacao'));

insert into public.teams (name)
select 'Operação'
where not exists (select 1 from public.teams where name = 'Operação');

-- Depois de rodar isso, crie o login em Authentication > Users (Supabase) e
-- insira o perfil, por exemplo:
--   insert into public.profiles (id, name, username, role, team_id, active)
--   values (
--     '<uuid do usuário criado>',
--     'Nome da pessoa',
--     'usuario.login',
--     'operacao',
--     (select id from public.teams where name = 'Operação'),
--     true
--   );
