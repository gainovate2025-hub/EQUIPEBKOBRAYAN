# Painel BKO

Site interno da equipe BKO: faturas, comprovantes, reagendamentos, CustCode,
comissão, ranking, Crivo (consulta de CNPJ) e registro de vendas CNPJ.
Feito com Vite + React + Tailwind, com banco e login no Supabase.

## Papéis

| Papel        | O que vê                                                        |
| ------------ | --------------------------------------------------------------- |
| `supervisor` | Tudo: dashboard da equipe, comissão, automações, configurações. |
| `lider`      | O mesmo painel do supervisor, limitado à própria equipe.        |
| `bko`        | Faturas, comprovantes, CustCode, reagendamento, ranking.        |
| `operacao`   | Crivo e consulta CNPJ com registro de venda.                    |
| `cadastro`   | Fila de vendas pra cadastrar.                                   |

A fila de aprovação de contestação foi removida em 05/11/2026 (migration_043).
Hoje só sobra a contagem de contestações feitas.

## Banco de dados (Supabase)

1. No painel do Supabase, abra o **SQL Editor** e rode `supabase/schema.sql`.
2. Depois rode as migrations de `supabase/` **em ordem de número**
   (`migration_002_...`, `migration_003_...` até a última). Algumas têm o
   mesmo número com nomes diferentes: rode as duas.
3. As migrations são rodadas na mão, colando o SQL no painel.

## Variáveis de ambiente

Copie `.env.example` pra `.env` e preencha. Tudo que começa com `VITE_` vai
junto no site publicado (é público). A `SUPABASE_SERVICE_ROLE_KEY` é só pros
scripts locais de `scripts/` e nunca pode ir pro site nem pro git.

## Rodar no computador

```bash
npm install
npm run dev
```

## Publicar

O site é publicado no GitHub Pages sozinho a cada push na `main`
(`.github/workflows/deploy.yml`). As variáveis `VITE_*` ficam nos *Secrets*
do repositório no GitHub.

As Edge Functions (`supabase/functions/`) são publicadas à parte:

```bash
supabase functions deploy admin-set-password
supabase functions deploy consulta-operadora
supabase functions deploy sheets-faturas
```

## Pastas

- `src/`: o site (páginas em `src/pages`, peças visuais em `src/components/ui`).
- `supabase/`: `schema.sql`, migrations e Edge Functions.
- `extensao-crivo/`, `extensao-portal-parcelamento/`, `extensao-3cplus-ia/`:
  extensões do Chrome usadas pela equipe.
- `3cplus-ia-backend/`: servidor de apoio da extensão do 3CPlus.
- `whatsapp-bot/`: bot de atendimento e servidor do QR code.
- `scripts/`: scripts locais de criação de contas (usam a service role key).
