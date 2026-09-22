# Publicar na Chrome Web Store

Passo a passo pra virar "clica em Adicionar ao Chrome" em vez de carregar sem compactação.

## Antes de começar

- Conta Google (pode ser a mesma do Supabase/painel) — precisa pagar uma taxa **única** de
  US$ 5 no [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
  na primeira vez que for publicar qualquer extensão.
- **Visibilidade recomendada: "Não listado" (Unlisted).** Essa extensão só faz sentido pra
  quem tem login no Easy Vendas da TIM — não tem por que aparecer em busca pública. "Não
  listado" já resolve o "clica e instala" sem expor a ferramenta pra qualquer pessoa.

## 1. Gerar o pacote (.zip)

Dentro da pasta `extensao-crivo/`, compacta TODOS os arquivos (não a pasta em si, o
conteúdo dela) num .zip. Exemplo pelo terminal, rodando de dentro da pasta:

```bash
cd extensao-crivo
zip -r ../crivo-tim.zip . -x ".*"
```

## 2. Enviar no Dashboard

1. Abre o [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Novo item**.
2. Envia o `crivo-tim.zip`.
3. Preenche a ficha (texto pronto abaixo).
4. Em **Visibilidade**, escolhe **Não listado**.
5. Envia pra revisão. O Google costuma levar de algumas horas a poucos dias pra aprovar.

## 3. Texto da ficha (copiar e colar)

**Nome:** Crivo TIM — Painel BKO

**Descrição curta** (até 132 caracteres):
> Consulta CNPJ no Easy Vendas (TIM) e responde aprovado/reprovado automaticamente no Painel BKO.

**Descrição detalhada:**
> Ferramenta interna da nossa equipe. Automatiza a consulta de crédito de um CNPJ nos dois
> sistemas do Easy Vendas (TIM) — digita o CNPJ, lê o resultado da pré-análise e grava
> aprovado/reprovado direto no Painel BKO, sem precisar copiar e colar nada manualmente.
>
> Só funciona pra quem já tem acesso ao Easy Vendas da TIM e ao Painel BKO da equipe — não é
> uma ferramenta de uso geral.

**Categoria:** Produtividade

**Política de privacidade (URL obrigatória):**
> https://gainovate2025-hub.github.io/EQUIPEBKOBRAYAN/privacidade

**Ícone da loja (128×128):** já vem em `icons/icon128.png`.

**Screenshots (1280×800 ou 640×400):** a loja pede pelo menos 1. Print do popup da extensão
(clica no ícone dela com uma aba do Easy Vendas aberta) já serve.

## 4. Depois de aprovado

O Dashboard te dá um link de instalação — manda esse link pro time (ex: no grupo do
WhatsApp, ou como um botão na tela Automações do Painel BKO). Qualquer atualização de
código depois disso é só subir um novo .zip no mesmo item do Dashboard — não precisa pedir
pra ninguém reinstalar, o Chrome atualiza sozinho.
