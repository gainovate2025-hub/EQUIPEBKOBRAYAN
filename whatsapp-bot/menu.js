// Lógica do atendimento por WhatsApp — só decide QUAL texto responder.
// Não sabe nada de WhatsApp/rede: recebe a conversa + a mensagem e devolve
// as respostas. Isso deixa tudo testável sem precisar de número real.

const HORAS_ATE_RECOMECAR = 12

const RODAPE = 'Caso precise de mais alguma coisa, digite menu para voltar às opções.'

export const MENU = `Olá! 👋 Você está falando com o canal oficial de atendimento da TIM Empresas.
Para agilizar seu atendimento, digite o número da opção que melhor representa sua necessidade:
1 Fatura (segunda via, valores, problemas de cobrança)
2 Portabilidade (como funciona, prazos, problemas com SMS, titularidade)
3 Questões contratuais (alterações, cancelamento, renovação)
4 Adição de novas linhas
5 Dúvidas ou outros assuntos`

const FATURA = `Você selecionou Fatura. Aqui está o passo a passo para consulta e pagamento:

1 Acesse: https://www.timnegocia.com.br
2 Digite seu CNPJ e clique em Enviar/Continuar
3 Informe um número de telefone para receber o código por SMS (pode ser de qualquer operadora)
4 Digite o código recebido e clique em Continuar
5 Escolha o contrato desejado
6 Selecione a fatura em aberto
7 Clique em Pagar Conta e escolha a forma de pagamento

💳 Pagamento disponível via PIX (confirmação imediata) ou Cartão/Wallets (parcelamento em até 12x).

${RODAPE}`

const PORTABILIDADE = `Você selecionou Portabilidade. Para dar andamento à portabilidade do seu número para a TIM Empresas, você receberá um SMS do número 7678 (Anatel) pedindo confirmação.

📌 Para confirmar, basta responder SIM a essa mensagem.
⏰ O prazo para seu número ser portado estará disponível no SMS do número 4196

Se não recebeu o SMS, teve problema com o código ou com a titularidade da linha, digite 3 para falar com nossa equipe.

${RODAPE}`

const CONTRATUAIS = `Você selecionou Questões contratuais. Para alterações, cancelamento ou renovação de contrato, precisamos confirmar alguns dados com você.

Por favor, informe:
📄 CNPJ da empresa
📝 O que deseja solicitar (informações, cancelamento ou envio de contrato via WhatsApp)

Em instantes, um de nossos atendentes dará continuidade ao seu atendimento.

${RODAPE}`

const NOVAS_LINHAS = `Você selecionou Adição de novas linhas. Para agilizar sua solicitação, informe:

📄 CNPJ da empresa
🔢 Quantidade de linhas desejadas
📶 Plano de interesse (portabilidade ou linha nova)

Nossa equipe comercial entrará em contato para finalizar sua solicitação.

${RODAPE}`

const OUTROS = `Você selecionou Dúvidas ou outros assuntos. Por favor, descreva brevemente o que você precisa que em instantes um de nossos atendentes irá te ajudar.

${RODAPE}`

// Opções 3, 4 e 5 passam a conversa pra um atendente — depois delas o bot
// fica quieto (senão responderia o menu em cima de cada mensagem do
// cliente enquanto o atendente conversa). Só "menu" traz o bot de volta.
const OPCOES = {
  1: { texto: FATURA, estadoDepois: 'menu' },
  2: { texto: PORTABILIDADE, estadoDepois: 'menu' },
  3: { texto: CONTRATUAIS, estadoDepois: 'humano' },
  4: { texto: NOVAS_LINHAS, estadoDepois: 'humano' },
  5: { texto: OUTROS, estadoDepois: 'humano' },
}

function normalizar(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// conversa: { estado: 'menu' | 'humano', ultimaMsgEm: number } ou undefined
// Devolve { respostas: string[], conversa }
export function responder(conversa, texto, agora = Date.now()) {
  const expirou = !conversa || agora - conversa.ultimaMsgEm > HORAS_ATE_RECOMECAR * 3600 * 1000
  const proxima = (estado) => ({ estado, ultimaMsgEm: agora })

  // Qualquer primeira mensagem (ou a primeira depois de um tempão) mostra o menu.
  if (expirou) return { respostas: [MENU], conversa: proxima('menu') }

  const norm = normalizar(texto)
  if (norm === 'menu') return { respostas: [MENU], conversa: proxima('menu') }

  if (conversa.estado === 'humano') return { respostas: [], conversa: proxima('humano') }

  const achou = norm.match(/^\D*([1-5])\D*$/)
  if (achou) {
    const opcao = OPCOES[achou[1]]
    return { respostas: [opcao.texto], conversa: proxima(opcao.estadoDepois) }
  }

  return {
    respostas: [`Não entendi sua mensagem 🙁\n\n${MENU}`],
    conversa: proxima('menu'),
  }
}
