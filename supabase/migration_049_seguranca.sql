-- Painel BKO: correções de segurança (10/11/2026).
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois da 048.
-- Seguro rodar mais de uma vez.
--
-- Nada aqui muda o que as extensões do Chrome (chave anon) fazem: elas
-- não leem profiles, vendas_cnpj, comprovantes nem a view de logs, e não
-- chamam as funções alteradas abaixo. O site foi ajustado junto
-- (src/lib/api.js usa a função atualizar_nome_perfil).


-- ---------------------------------------------------------------------
-- Função de apoio: papel de quem está logado.
-- security definer pra não cair em recursão de RLS ao ler profiles.
-- ---------------------------------------------------------------------
create or replace function public.meu_papel()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.meu_papel() to authenticated;


-- ---------------------------------------------------------------------
-- 1) profiles: só o supervisor escreve direto na tabela.
--
-- Antes (migration_002) o líder podia fazer update em qualquer perfil
-- do próprio time, inclusive no PRÓPRIO, e mudar a coluna role pra
-- 'supervisor'. Ou seja, qualquer líder conseguia virar supervisor.
--
-- O site só precisa que o líder troque o NOME de um BKO (modal Editar no
-- Dashboard) e que cada pessoa troque o próprio nome (Configurações).
-- Isso passa a ser feito pela função atualizar_nome_perfil, que só mexe
-- no nome e nunca em role/team_id. Usuário e senha continuam pela Edge
-- Function admin-set-password.
-- ---------------------------------------------------------------------
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles
  for all using (public.is_supervisor()) with check (public.is_supervisor());

create or replace function public.atualizar_nome_perfil(p_user_id uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alvo public.profiles%rowtype;
  v_papel text := public.meu_papel();
begin
  if auth.uid() is null then
    raise exception 'Faça login novamente.';
  end if;
  if trim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome.';
  end if;

  select * into v_alvo from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  -- Quem pode: o supervisor (qualquer um), a própria pessoa, ou o líder
  -- (só gente do time dele que não seja supervisor nem líder).
  if not (
    v_papel = 'supervisor'
    or p_user_id = auth.uid()
    or (
      v_papel = 'lider'
      and v_alvo.team_id = public.my_team_id()
      and v_alvo.role not in ('supervisor', 'lider')
    )
  ) then
    raise exception 'Você não pode alterar o nome desse usuário.';
  end if;

  update public.profiles set name = trim(p_nome) where id = p_user_id;
end;
$$;

revoke execute on function public.atualizar_nome_perfil(uuid, text) from public, anon;
grant execute on function public.atualizar_nome_perfil(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2) _resetar_comprovantes_mes_impl: só o agendamento (cron) e a função
-- resetar_comprovantes_mes (que confere se é supervisor) podem chamar.
--
-- Por padrão o Postgres deixa qualquer um executar funções novas, então
-- qualquer pessoa (até sem login, pela chave anon) conseguia apagar todos
-- os comprovantes chamando essa função direto pela API.
-- O cron roda como postgres e a função "de fora" é security definer, então
-- os dois continuam funcionando.
-- ---------------------------------------------------------------------
revoke execute on function public._resetar_comprovantes_mes_impl() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) View crivo_logs_recentes passa a respeitar o RLS de quem consulta.
--
-- Sem isso a view roda com os direitos do dono (postgres) e ignora o RLS
-- de crivo_logs/crivo_consultas: qualquer um com a chave anon conseguia
-- ler os logs e os CNPJs consultados. Ninguém (site nem extensão) lê essa
-- view pela API; ela é só pra diagnóstico no SQL Editor, que continua
-- funcionando igual.
-- ---------------------------------------------------------------------
alter view public.crivo_logs_recentes set (security_invoker = true);


-- ---------------------------------------------------------------------
-- 4a) Reagendamento: no máximo 50 por envio.
--
-- Cada reagendamento soma R$1 na comissão. Sem limite, um BKO podia
-- mandar 100000 de uma vez pela API. O site já avisa antes de enviar.
-- ---------------------------------------------------------------------
create or replace function public.registrar_reagendamento_proprio(p_quantidade integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantidade is null or p_quantidade < 1 then
    raise exception 'Informe quantos reagendamentos você fez.';
  end if;
  if p_quantidade > 50 then
    raise exception 'Envie no máximo 50 reagendamentos de uma vez.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode registrar reagendamento.';
  end if;

  insert into public.reagendamento_casos (bko_id, cnpj, razao_social, custcode, quantidade, status, criado_por, feito_em)
  values (auth.uid(), '', '', '', p_quantidade, 'feito', auth.uid(), now());

  update public.performance
  set rescheduling_done = rescheduling_done + p_quantidade,
      commission = commission + p_quantidade,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.registrar_reagendamento_proprio(integer) from public, anon;
grant execute on function public.registrar_reagendamento_proprio(integer) to authenticated;


-- ---------------------------------------------------------------------
-- 4b) Comprovante de fatura: só conta se o arquivo foi mesmo enviado.
--
-- Cada comprovante soma +1 fatura e +R$2. Antes dava pra chamar a função
-- várias vezes com um caminho inventado (ou o mesmo arquivo) e ganhar
-- comissão sem enviar nada. Agora exige que:
--   - o arquivo exista no bucket "comprovantes", dentro da pasta do
--     próprio usuário (o site envia em <id do usuário>/<hora>.<ext>);
--   - esse arquivo ainda não tenha sido registrado;
--   - o link aponte pro próprio arquivo no storage (nada de link externo
--     no relatório do supervisor).
-- O site já faz o upload ANTES de chamar a função (bko/Comprovantes.jsx),
-- então nada muda pra quem usa.
-- ---------------------------------------------------------------------
create or replace function public.registrar_comprovante_fatura(
  p_arquivo_path text,
  p_arquivo_url text,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_arquivo_path, '')) = '' or trim(coalesce(p_arquivo_url, '')) = '' then
    raise exception 'Arquivo do comprovante não encontrado.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'bko') then
    raise exception 'Só BKO pode enviar comprovante.';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'comprovantes'
      and name = p_arquivo_path
      and (storage.foldername(name))[1] = auth.uid()::text
  ) then
    raise exception 'Arquivo do comprovante não encontrado. Envie o arquivo de novo.';
  end if;
  if exists (select 1 from public.comprovantes_fatura where arquivo_path = p_arquivo_path) then
    raise exception 'Esse comprovante já foi registrado.';
  end if;
  if p_arquivo_url not like '%/storage/v1/object/public/comprovantes/' || p_arquivo_path then
    raise exception 'Link do comprovante inválido.';
  end if;

  insert into public.comprovantes_fatura (user_id, arquivo_path, arquivo_url, observacao)
  values (auth.uid(), p_arquivo_path, p_arquivo_url, nullif(trim(coalesce(p_observacao, '')), ''));

  update public.performance
  set faturas_done = faturas_done + 1,
      commission = commission + 2,
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.registrar_comprovante_fatura(text, text, text) from public, anon;
grant execute on function public.registrar_comprovante_fatura(text, text, text) to authenticated;

-- Insert direto na tabela não é mais usado pelo site (desde a 047 tudo
-- passa pela função acima). E o BKO apagar o próprio registro permitia
-- registrar o mesmo arquivo de novo e ganhar os R$2 outra vez. Quem
-- apaga é só supervisor/líder (e o reset mensal).
drop policy if exists "comprovantes_fatura_insert_proprio" on public.comprovantes_fatura;

drop policy if exists "comprovantes_fatura_delete_proprio_ou_supervisor" on public.comprovantes_fatura;
create policy "comprovantes_fatura_delete_supervisor" on public.comprovantes_fatura
  for delete to authenticated
  using (public.meu_papel() in ('supervisor', 'lider'));


-- ---------------------------------------------------------------------
-- 5) vendas_cnpj: cada operador vê só as próprias vendas.
--
-- Antes qualquer conta logada (até BKO) lia e alterava todas as vendas,
-- com CPF, telefone e e-mail dos clientes.
--   - SELECT: quem criou (a tela de venda lê de volta a ficha que acabou
--     de salvar), supervisor, líder (Desempenho de vendas) e cadastro
--     (fila de Vendas pra cadastrar).
--   - UPDATE: quem criou, supervisor, líder e cadastro (marca como
--     cadastrado).
-- O insert continua igual (só em nome de quem está logado).
-- ---------------------------------------------------------------------
drop policy if exists vendas_cnpj_select on public.vendas_cnpj;
create policy vendas_cnpj_select on public.vendas_cnpj
  for select to authenticated
  using (
    solicitado_por = auth.uid()
    or public.meu_papel() in ('supervisor', 'lider', 'cadastro')
  );

drop policy if exists vendas_cnpj_update on public.vendas_cnpj;
create policy vendas_cnpj_update on public.vendas_cnpj
  for update to authenticated
  using (
    solicitado_por = auth.uid()
    or public.meu_papel() in ('supervisor', 'lider', 'cadastro')
  )
  with check (
    solicitado_por = auth.uid()
    or public.meu_papel() in ('supervisor', 'lider', 'cadastro')
  );
