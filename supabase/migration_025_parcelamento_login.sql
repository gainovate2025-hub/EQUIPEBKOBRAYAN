-- Login do Portal Parcelamento: a TIM usa autenticação em duas etapas
-- (matrícula + código de um token físico RSA SecurID que muda a cada
-- minuto), então não dá pra guardar uma senha fixa em lugar nenhum. Em
-- vez disso, a pessoa cola a matrícula + o código do token (olhando o
-- chaveiro/app na hora) na tela do site (Automações > Portal
-- Parcelamento), e a extensão lê daqui pra preencher e entrar sozinha
-- assim que cair numa tela de login. Uma linha só (id sempre 1) — cada
-- login novo substitui o anterior.
--
-- O token vale só ~1 minuto, então "criado_em" é o que a extensão usa
-- pra saber se ainda vale a pena tentar (ver PP_LOGIN_MAX_IDADE_MS no
-- background.js) — não adianta guardar histórico, é sempre "o último".

create table if not exists public.parcelamento_login (
  id int primary key default 1,
  usuario text,
  token text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  constraint parcelamento_login_singleton check (id = 1)
);

insert into public.parcelamento_login (id) values (1)
  on conflict (id) do nothing;

alter table public.parcelamento_login enable row level security;

-- A extensão (chave anon, sem login) só LÊ, pra saber se tem um login
-- pendente pra usar.
drop policy if exists parcelamento_login_select on public.parcelamento_login;
create policy parcelamento_login_select on public.parcelamento_login
  for select using (true);

-- Qualquer pessoa logada no site pode colar seu próprio login pra
-- automação usar — não é uma ação exclusiva de supervisor, porque
-- qualquer um com uma matrícula válida na TIM pode operar a extensão.
drop policy if exists parcelamento_login_update on public.parcelamento_login;
create policy parcelamento_login_update on public.parcelamento_login
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
