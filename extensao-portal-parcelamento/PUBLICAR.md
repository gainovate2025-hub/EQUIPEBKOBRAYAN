# Publicar na Chrome Web Store

Mesmo processo do `extensao-crivo/` (veja o `PUBLICAR.md` de lá pra mais detalhe em cada
passo) — aqui só o que muda pra esta extensão.

## Um alerta importante antes de publicar

Essa extensão automatiza o **WhatsApp Web** (digita mensagem, anexa arquivo, envia sozinha).
O Google às vezes barra ou tira do ar extensões desse tipo na revisão, porque automatizar o
WhatsApp Web entra numa área cinzenta dos termos de uso do próprio WhatsApp — não é uma regra
fixa (tem extensão assim publicada e no ar), mas é um risco real de rejeição que não dá pra
prever com certeza antes de tentar.

Se a Chrome Web Store recusar, o plano B (que já funciona hoje, sem depender de aprovação de
ninguém) é continuar instalando "sem compactação" — só que aí, em vez de mandar o link do
repositório inteiro, dá pra deixar o .zip da pasta pronto pra download direto no site (ex: um
botão "Baixar extensão" na tela Automações), com o passo a passo de `chrome://extensions` no
modal que já existe lá.

## 1. Gerar o pacote (.zip)

```bash
cd extensao-portal-parcelamento
zip -r ../portal-parcelamento.zip . -x ".*" -x "apps-script/*" -x "PUBLICAR.md" -x "README.md"
```
(deixa `apps-script/Code.gs` e os `.md` de fora do .zip — são só documentação, não fazem
parte da extensão em si.)

## 2. Texto da ficha (copiar e colar)

**Nome:** Portal Parcelamento — Envio de Faturas

**Descrição curta** (até 132 caracteres):
> Consulta fatura no Portal Parcelamento por Custcode e envia pro cliente pelo WhatsApp Web automaticamente.

**Descrição detalhada:**
> Ferramenta interna da nossa equipe. Pra cada cliente pendente numa planilha (configurada
> pelo supervisor no Painel BKO), consulta o Custcode no Portal Parcelamento da TIM: se não
> tiver fatura em aberto, marca isso na planilha; se tiver, baixa o PDF e manda pro cliente
> pelo WhatsApp Web (aviso + fatura + cobrança), atualizando a planilha ao final.
>
> Só funciona pra quem já tem acesso ao Portal Parcelamento da TIM, ao WhatsApp Web e ao
> Painel BKO da equipe — não é uma ferramenta de uso geral.

**Categoria:** Produtividade

**Visibilidade:** Não listado

**Política de privacidade (URL obrigatória):**
> https://gainovate2025-hub.github.io/EQUIPEBKOBRAYAN/privacidade

**Ícone da loja (128×128):** já vem em `icons/icon128.png`.
