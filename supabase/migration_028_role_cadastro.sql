-- Rascunho "Consulta CNPJ + Venda": papel novo "cadastro" — login enxuto
-- (só a fila de "Vendas pra Cadastrar") pra quem registra as vendas no
-- sistema de verdade. Mesmo padrão da migration_014_operacao.sql.
-- Rode no SQL Editor do Supabase, depois das migrações anteriores.
-- Seguro rodar mais de uma vez.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('supervisor', 'bko', 'lider', 'operacao', 'cadastro'));

insert into public.teams (name)
select 'Cadastro'
where not exists (select 1 from public.teams where name = 'Cadastro');

-- Depois de rodar isso, crie o login em Authentication > Users (Supabase) e
-- insira o perfil, por exemplo:
--   insert into public.profiles (id, name, username, role, team_id, active)
--   values (
--     '<uuid do usuário criado>',
--     'Nome da pessoa',
--     'usuario.login',
--     'cadastro',
--     (select id from public.teams where name = 'Cadastro'),
--     true
--   );
