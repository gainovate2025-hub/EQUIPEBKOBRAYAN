# Portal Parcelamento — envio de faturas por e-mail

Extensão Chrome que consulta o Custcode no Portal Parcelamento da TIM e
manda a fatura por e-mail usando a opção **nativa do próprio Portal**
("Selecionar método de envio" > EMAIL) — sem baixar PDF, sem WhatsApp.

## Como instalar

1. `chrome://extensions` → ativa "Modo do desenvolvedor" → "Carregar sem compactação" → escolhe essa pasta.
2. Deixa uma aba do Portal Parcelamento aberta.
3. Clica no ícone da extensão → **Ligar**.
4. Se a aba do Portal cair numa tela de login (matrícula/token do RSA), usa o formulário "Login" no site do BKO (Automações > Portal Parcelamento) — a extensão lê o que for colado lá.

## Configuração (feita pelo site do BKO)

Em Automações > Portal Parcelamento, o supervisor configura:
- URL do Apps Script (Web App) — veja `apps-script/Code.gs`.
- Link da planilha e nome da aba.
- Nome das colunas de Custcode, E-mail, Telefone e Status (onde escreve "FATURA ENVIADA POR EMAIL").

## Fluxo automatizado

1. Busca por Custcode (garante que "Motivo" está em "Segunda Via de Conta" — nem sempre vem assim por padrão).
2. Lista de "Faturas Em Aberto" — seleciona uma (confere que marcou de verdade antes de confirmar).
3. "Selecionar método de envio" — marca **EMAIL** (nunca Impressão Online/SMS).
4. Cola o e-mail do cliente (vindo da planilha) no campo "Destinatários" e confirma.
5. Tela de conferência final ("Destino do Email") — confirma de novo, isso manda o e-mail de verdade (o Portal não tem uma tela separada de "enviado com sucesso").
6. Se o cliente tiver mais de uma fatura em aberto, repete pra cada uma antes de marcar como concluído.

## Detalhe técnico importante

O campo do Custcode (e o de e-mail) não aceitam bem digitação simulada
por JavaScript — o Portal às vezes recusa como "inválido" mesmo com o
valor certo na tela. A extensão usa `chrome.debugger` (permissão do
Chrome) pra colar de verdade (Ctrl+A + Ctrl+V reais), copiando o valor
pra área de transferência primeiro — o mesmo que a pessoa faz na mão.
Aparece uma faixa amarela do Chrome avisando "extensão depurando essa
aba" durante o instante da colagem — é normal.
