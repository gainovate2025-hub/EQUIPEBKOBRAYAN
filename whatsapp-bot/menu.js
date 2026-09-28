// Lógica do atendimento por WhatsApp — só decide QUAL texto responder e
// QUANDO um caso deve ser encaminhado pra um atendente humano.
// Não sabe nada de WhatsApp/rede nem de banco de dados: recebe a conversa
// + a mensagem e devolve as respostas (e, quando for a hora, os dados
// pra encaminhar). Isso deixa tudo testável sem precisar de número real
// nem de conexão com o Supabase — quem grava no banco é o servidor
// (server.js / qr-server.js), lendo o campo `encaminhar` do resultado.

const HORAS_ATE_RECOMECAR = 12

const RODAPE = 'Caso precise de mais alguma coisa, digite menu para voltar às opções.'

export const MENU = `Olá! 👋 Você está falando com o canal oficial de atendimento da TIM Empresas.
Digite o número da opção que melhor representa sua necessidade:
1 Fatura (segunda via, valores, problemas de cobrança)
2 Portabilidade (como funciona, prazos, problemas com SMS, titularidade)
3 Falar com um atendente`

const FATURA = `Você selecionou Fatura. Aqui está o passo a passo para consulta e pagamento:

1 Acesse: https://www.timnegocia.com.br
2 Digite seu CNPJ e clique em Enviar/Continuar
3 Informe um número de telefone para receber o código por SMS (pode ser de qualquer operadora)
4 Digite o código recebido e clique em Continuar
5 Escolha o contrato desejado
6 Selecione a fatura em aberto
7 Clique em Pagar Conta e escolha a forma de pagamento

💳 Pagamento disponível via PIX (confirmação imediata) ou Cartão/Wallets (parcelamento em até 12x).

Se isso não resolver, digite 3 para falar com um atendente.
${RODAPE}`

const PORTABILIDADE = `Você selecionou Portabilidade. Para dar andamento à portabilidade do seu número para a TIM Empresas, você receberá um SMS do número 7678 (Anatel) pedindo confirmação.

📌 Para confirmar, basta responder SIM a essa mensagem.
⏰ O prazo para seu número ser portado estará disponível no SMS do número 4196

Se não recebeu o SMS, teve problema com o código ou com a titularidade da linha, digite 3 para falar com um atendente.

${RODAPE}`

const PERGUNTA_ASSUNTO_ATENDENTE = 'Sem problema! Seu caso é sobre Fatura ou Portabilidade? Digite 1 para Fatura ou 2 para Portabilidade.'
const PERGUNTA_NOME = 'Certo, vou te encaminhar para um atendente. Qual é o seu nome?'
const PERGUNTA_CNPJ = 'E qual é o CNPJ da empresa?'

function confirmacaoEncaminhado(nome) {
  return `Perfeito, ${nome}! Encaminhei seu caso para a nossa equipe — em breve alguém entra em contato com você.\n\n${RODAPE}`
}

const OPCOES = {
  1: { texto: FATURA, assunto: 'fatura' },
  2: { texto: PORTABILIDADE, assunto: 'portabilidade' },
}

function normalizar(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function pareceQuererAtendente(normTexto) {
  return normTexto === '3' || /atendente|humano|pessoa de verdade|falar com alguem/.test(normTexto)
}

// conversa: {
//   estado: 'menu' | 'aguardando_assunto_humano' | 'aguardando_nome' | 'aguardando_cnpj' | 'humano',
//   ultimaMsgEm: number,
//   ultimoAssunto: 'fatura' | 'portabilidade' | null,
//   coleta: { assunto, nome } | undefined,
// } ou undefined
//
// Devolve { respostas: string[], conversa, encaminhar?: { assunto, nome, cnpj } }
export function responder(conversa, texto, agora = Date.now()) {
  const expirou = !conversa || agora - conversa.ultimaMsgEm > HORAS_ATE_RECOMECAR * 3600 * 1000
  const proxima = (estado, extra = {}) => ({
    estado,
    ultimaMsgEm: agora,
    ultimoAssunto: conversa?.ultimoAssunto ?? null,
    ...extra,
  })

  // Qualquer primeira mensagem (ou a primeira depois de um tempão) mostra o menu.
  if (expirou) return { respostas: [MENU], conversa: proxima('menu') }

  const norm = normalizar(texto)
  if (norm === 'menu') return { respostas: [MENU], conversa: proxima('menu') }

  // Depois de encaminhado, o bot fica quieto (o atendente assume) — só
  // "menu" traz ele de volta.
  if (conversa.estado === 'humano') return { respostas: [], conversa: proxima('humano') }

  // --- Coletando os dados pra encaminhar (nome, depois CNPJ) ---
  if (conversa.estado === 'aguardando_assunto_humano') {
    if (norm === '1' || norm === '2') {
      const assunto = norm === '1' ? 'fatura' : 'portabilidade'
      return { respostas: [PERGUNTA_NOME], conversa: proxima('aguardando_nome', { ultimoAssunto: assunto, coleta: { assunto } }) }
    }
    return { respostas: [PERGUNTA_ASSUNTO_ATENDENTE], conversa: proxima('aguardando_assunto_humano') }
  }

  if (conversa.estado === 'aguardando_nome') {
    const nome = texto.trim()
    if (!nome) return { respostas: [PERGUNTA_NOME], conversa: proxima('aguardando_nome', { coleta: conversa.coleta }) }
    return {
      respostas: [PERGUNTA_CNPJ],
      conversa: proxima('aguardando_cnpj', { coleta: { ...conversa.coleta, nome } }),
    }
  }

  if (conversa.estado === 'aguardando_cnpj') {
    const cnpj = texto.trim()
    if (!cnpj) return { respostas: [PERGUNTA_CNPJ], conversa: proxima('aguardando_cnpj', { coleta: conversa.coleta }) }
    const { assunto, nome } = conversa.coleta
    return {
      respostas: [confirmacaoEncaminhado(nome)],
      conversa: proxima('humano'),
      encaminhar: { assunto, nome, cnpj },
    }
  }

  // --- Estado normal (menu) ---
  if (pareceQuererAtendente(norm)) {
    // Se o cliente já tinha escolhido Fatura ou Portabilidade antes, não
    // precisa perguntar nada — já sabe o assunto.
    if (conversa.ultimoAssunto) {
      return {
        respostas: [PERGUNTA_NOME],
        conversa: proxima('aguardando_nome', { coleta: { assunto: conversa.ultimoAssunto } }),
      }
    }
    return { respostas: [PERGUNTA_ASSUNTO_ATENDENTE], conversa: proxima('aguardando_assunto_humano') }
  }

  const achou = norm.match(/^\D*([12])\D*$/)
  if (achou) {
    const opcao = OPCOES[achou[1]]
    return { respostas: [opcao.texto], conversa: proxima('menu', { ultimoAssunto: opcao.assunto }) }
  }

  return {
    respostas: [`Não entendi sua mensagem 🙁\n\n${MENU}`],
    conversa: proxima('menu'),
  }
}
