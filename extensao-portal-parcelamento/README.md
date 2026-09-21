# Portal Parcelamento — Envio de Faturas

Extensão Chrome que, pra cada cliente pendente na planilha:
1. Consulta o Custcode no Portal Parcelamento (TIM).
2. Se não tiver fatura em aberto, escreve **"não tem fatura"** na coluna
   `DATA DA FATURA`.
3. Se tiver, baixa o PDF de cada fatura em aberto e manda pro cliente
   pelo WhatsApp Web (aviso + PDF + cobrança), e escreve a data de hoje
   na coluna `DATA DA FATURA`.

## Como funciona (visão geral)

```
Planilha (Google Sheets)
   ↕  via Apps Script (apps-script/Code.gs)
background.js  ──abre/recarrega──►  aba do Portal Parcelamento
      │                                   │ (portal.js + portal-automation.js)
      │                                   ▼ PDF pronto (base64)
      └──abre/recarrega──►  aba do WhatsApp Web
                                    (whatsapp.js + whatsapp-automation.js)
```

Um cliente por vez, sequencial — igual o projeto Crivo (`extensao-crivo/`),
mesmo estilo de código: seletores separados da automação, e um laço que
olha o estado ATUAL da tela a cada rodada em vez de "clicar e torcer".

## Passo a passo pra colocar no ar

### 1. Planilha
Precisa ter (nomes dos cabeçalhos na linha 1, em qualquer ordem/coluna):
`CUSTCODE`, `CLIENTE`, `TELEFONE`, e você cria a coluna `DATA DA FATURA`
(fica em branco até a extensão processar essa linha).

### 2. Apps Script (a ponte com a planilha)
Segue as instruções no topo do arquivo `apps-script/Code.gs` — resumindo:
Extensões > Apps Script na planilha, cola o código, Implantar > Novo
deploy > Aplicativo da Web > acesso "Qualquer pessoa", copia a URL gerada.

### 3. Instalar a extensão
`chrome://extensions` → ativa "Modo do desenvolvedor" → "Carregar sem
compactação" → seleciona a pasta `extensao-portal-parcelamento/`.

### 4. Configurar
Clica no ícone da extensão:
- Cola a **URL do Apps Script**.
- Cola o **link da planilha** (a extensão extrai o ID sozinha).
- Confirma o **nome da aba** (ex: "Custo Code").
- Salvar → Ligar.

Deixa uma aba do Portal Parcelamento logada e uma aba do WhatsApp Web
logada (a extensão abre/reaproveita as abas sozinha, mas o login inicial
é manual, igual o Crivo).

## Importante — partes que precisam de um teste ao vivo

Não tenho como testar contra o site/WhatsApp reais. O fluxo do Custcode
até o botão "Confirmar" da fatura tá com os ids exatos que você mandou
(`portal-selectors.js`, marcados **CONFIRMADO**). Só que três telas eu não
vi o HTML: a lista de "Faturas Em Aberto", a opção "Impressão Online" e a
tela final antes do PDF — usei busca por texto (mesmo truque do Crivo)
pra ter uma chance de funcionar, mas é bem provável que precise de ajuste
com o console aberto (F12) vendo se cada passo realmente clica no
elemento certo. Mesma coisa pro WhatsApp Web (seletores em
`whatsapp-selectors.js`), que muda de layout com frequência.

Se algum passo travar: abre o DevTools na aba, olha o console (os logs
começam com `[PortalParcelamento]`), copia o HTML do elemento que não
foi achado (botão direito → Inspecionar) e me manda que eu ajusto o
seletor certo — foi assim que o Crivo (`extensao-crivo/`) chegou no ponto
que tá hoje.

## Mensagens enviadas

Texto em `mensagens.js` — edita ali se quiser mudar o que é mandado (hoje
é um texto genérico de aviso + cobrança; dá pra trocar a qualquer hora).
