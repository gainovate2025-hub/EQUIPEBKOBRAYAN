# Painel BKO

Sistema de acompanhamento de equipe (Supervisor + 10 BKOs): metas, contestações,
reagendamentos, comissão, objetivos e notas — com banco de dados real (Supabase/Postgres),
autenticação e permissões por função (RBAC via Row Level Security).

## 1. Criar o projeto Supabase

1. Crie uma conta/projeto gratuito em [supabase.com/dashboard](https://supabase.com/dashboard).
2. No projeto, vá em **SQL Editor** e rode todo o conteúdo de `supabase/schema.sql`.
   Isso cria as tabelas `profiles`, `performance`, `notes` e as políticas de RLS.
3. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**
   - **service_role key** (secreta — só usada localmente pelo script de seed)

## 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e (para o seed) `SUPABASE_SERVICE_ROLE_KEY`.
O `.env` já está no `.gitignore` — nunca commitar a service_role key.

## 3. Instalar dependências e criar as 11 contas

```bash
npm install
npm run seed
```

Isso cria as contas listadas em `ACCOUNTS` dentro de `scripts/seed.mjs` (2 supervisores +
10 BKOs) e imprime a lista de usuário/senha no final. Se alguma senha tiver menos de 6
caracteres (mínimo do Supabase Auth), o script avisa e segue criando as demais — corrija
a senha no arquivo e rode `npm run seed` de novo, contas já criadas não duplicam.
**Troque essas senhas depois do primeiro acesso** — pelo painel de Configurações
(supervisor) ou pelo modal de edição de cada BKO.

## 4. (Opcional) Troca de senha de BKO pelo supervisor

Trocar a senha de outra pessoa exige privilégio de administrador, que nunca deve
ficar exposto no frontend. Por isso essa ação passa por uma Edge Function:

```bash
supabase functions deploy admin-set-password
```

Sem isso publicado, o resto do sistema funciona normalmente — só a troca de senha
de um BKO pelo supervisor fica indisponível (o próprio BKO nunca troca a própria
senha; isso é intencional).

## 5. Rodar localmente

```bash
npm run dev
```

## Arquitetura

- **Frontend**: Vite + React + Tailwind, sem servidor próprio — fala direto com o
  Supabase (Postgres + Auth) via `@supabase/supabase-js`.
- **Autenticação**: Supabase Auth. O login usa "usuário" (não e-mail); cada conta
  tem um e-mail sintético `usuario@painelbko.internal` gerado automaticamente,
  nunca exposto na interface.
- **Autorização**: Row Level Security no Postgres — um BKO só enxerga a própria
  linha em `performance`/`notes`/`profiles`; o supervisor enxerga e edita tudo.
  Isso vale mesmo que alguém tente contornar pela URL ou pela API diretamente,
  porque a regra está no banco, não só no React Router.
- **Dados iniciais**: nenhum número fica fixo no código — tudo vem do banco e é
  editável pelo supervisor pelo próprio painel.
