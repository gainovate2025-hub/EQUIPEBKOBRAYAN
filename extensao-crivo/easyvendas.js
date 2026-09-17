// easyvendas.js — Extensão Crivo (Easy Vendas)
// -----------------------------------------------------------------------
// Orquestra a automação: fica de olho na tabela crivo_consultas
// (Supabase) e, quando aparece uma consulta pendente, usa
// EasyVendasAutomation (easyvendas-automation.js) pra digitar o CNPJ,
// clicar no botão certo e ler a mensagem de resultado.
//
// FLUXO É SEQUENCIAL, não os dois sistemas em paralelo:
//   1º sistema (Cliente) — https://.../EasyVendasWeb/#!/master/cliente/...
//      consulta o CNPJ que a operação mandou no chat. Se a mensagem citar
//      "Tim", é REPROVADO na hora (não passa pro 2º sistema). Qualquer
//      outra mensagem é aprovado ali e segue pro 2º sistema.
//   2º sistema (Negociação > 1ª Venda) —
//      https://.../EasyVendasWeb/#!/master/negociacao/primeiravenda/...
//      só entra em ação depois que o 1º aprovou. Digita o mesmo CNPJ,
//      clica AVANÇAR, e reprova se a mensagem citar retaguarda/negado/
//      inadimplente. Qualquer outra coisa é aprovado.
//
// Cada aba do Easy Vendas descobre SOZINHA se é o 1º ou o 2º sistema pela
// URL (não precisa mais escolher manualmente no ícone da extensão — isso
// evitava erro de marcar a aba errada). O popup continua existindo só
// como reforço/fallback caso a URL não bata com nenhum dos dois padrões.
//
// ESTRATÉGIA (igual o projeto P2B — veja background/service-worker.js de
// lá): em vez de uma função só que clica e fica esperando dentro dela
// (que quebra se a tela navegar no meio), o laço abaixo roda em rodadas
// curtas chamando detectarEstado()/textoNovoDesde() a cada uma — lê a
// tela ATUAL e decide o próximo passo, igual uma pessoa faria.
//
// IMPORTANTE — como preparar a tela: essa extensão NÃO cria uma
// negociação/cliente novo sozinha. Antes de ligar, deixa a aba aberta já
// na tela certa (Cliente, ou Negociação > 1ª Venda) — só usa o campo CNPJ
// pra consultar, nunca clica em SALVAR.
//
// Não precisa de login nenhum aqui — usa a chave pública (anon) do
// Supabase, que só permite mexer em consultas ainda "pendente" (veja
// migration_013 e migration_017 — grava via RPC, não direto na tabela).

const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

const POLL_IDLE_MS = 5000 // sem consulta em andamento: procura pendente de tanto em tanto
const POLL_ANDAMENTO_MS = 700 // com consulta em andamento: checa a tela rápido
const TIMEOUT_ANDAMENTO_MS = 25000 // tempo máximo esperando a mensagem de resultado antes de desistir (buscas de CNPJ podem demorar)

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Descobre pela URL da própria aba se é o 1º ou o 2º sistema — não
// depende de escolha manual (fonte de erro antiga: aba marcada errada).
function detectarSistemaPelaUrl() {
  if (location.href.includes('/negociacao/primeiravenda')) return 2
  if (location.href.includes('/cliente/')) return 1
  return null
}

async function pegarNumeroSistema() {
  const pelaUrl = detectarSistemaPelaUrl()
  if (pelaUrl) return pelaUrl
  try {
    const resp = await chrome.runtime.sendMessage({ tipo: 'crivo:pegarSistema' })
    return resp?.numero === 2 ? 2 : 1
  } catch {
    return 1
  }
}

function log(numeroSistema, ...args) {
  console.log(`[Crivo/EasyVendas #${numeroSistema}]`, ...args)
}

async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

// O 2º sistema só pode pegar uma consulta depois que o 1º já aprovou —
// por isso o filtro extra de sistema1_resultado=eq.aprovado. Se o 1º
// reprovar (ou não encontrar o CNPJ), a consulta nunca aparece pro 2º.
async function buscarPendente(numeroSistema) {
  const campoResultado = `sistema${numeroSistema}_resultado`
  let filtro = `status=eq.pendente&${campoResultado}=is.null`
  if (numeroSistema === 2) filtro += `&sistema1_resultado=eq.aprovado`

  const linhas = await supaFetch(
    `crivo_consultas?select=*&${filtro}&order=created_at.asc&limit=1`
  )
  return linhas?.[0] || null
}

// Grava pela função do banco (RPC), não direto na tabela — veja
// migration_017_crivo_rpc.sql pro motivo.
async function salvarResultado(id, numeroSistema, { resultado = null, motivo = null, erro = null }) {
  await supaFetch('rpc/crivo_salvar_resultado', {
    method: 'POST',
    body: JSON.stringify({
      p_id: id,
      p_numero_sistema: numeroSistema,
      p_resultado: resultado,
      p_motivo: motivo,
      p_erro: erro,
    }),
    prefer: 'return=minimal',
  })
}

function mensagemDiagnostico(estado) {
  if (estado.tipo !== 'desconhecido') return ''
  const botoes = estado.botoesVisiveis.join(' | ') || 'nenhum'
  return ` — url: ${estado.url} — botões vistos: ${botoes}`
}

// Tenta começar uma consulta nova. Devolve o "andamento" (consulta em
// curso) se conseguiu agir na tela, ou null se não tinha pendente (ou se
// deu erro já de cara, ex: não achou o formulário).
//
// No sistema 1, digita o CNPJ e clica na LUPA de busca primeiro (se
// achar uma) — a tela "Adicionar Clientes" parece exigir isso antes do
// Solicitar funcionar de verdade. Fica na fase 'buscando' até achar o
// botão de consultar (ou dar timeout). Se não achar nenhuma lupa, já
// tenta o botão de consultar direto, do jeito antigo.
// No sistema 2, digita e clica direto no botão de consultar (AVANÇAR) —
// não tem etapa de busca separada nessa tela.
async function tentarComecarNova(numeroSistema, automation) {
  const consulta = await buscarPendente(numeroSistema)
  if (!consulta) return null

  log(numeroSistema, 'Processando CNPJ', consulta.cnpj)

  // fecha qualquer janela de resultado deixada aberta de antes, sem
  // depender disso pra decidir o estado da tela.
  automation.fecharModal()

  const estado = automation.detectarEstado()
  if (estado.tipo !== 'formulario') {
    await salvarResultado(consulta.id, numeroSistema, {
      erro: `[${numeroSistema}º sistema] não achei o campo de CNPJ/botão na tela${mensagemDiagnostico(estado)}`,
    })
    return null
  }

  const base = { consulta, iniciadoEm: Date.now(), ultimoTextoNovo: '', estavel: 0 }

  if (numeroSistema === 1) {
    const botaoBuscar = automation.acharBotaoBuscar()
    if (botaoBuscar) {
      log(numeroSistema, 'Digitando CNPJ e clicando na lupa de busca')
      const fotoAntes = automation.tirarFotoTexto()
      automation.digitarCnpj(estado.campoCnpj, consulta.cnpj)
      botaoBuscar.click()
      return { ...base, fotoAntes, fase: 'buscando' }
    }
  }

  const fotoAntes = automation.tirarFotoTexto()
  automation.preencherEAvancar(estado, consulta.cnpj)
  return { ...base, fotoAntes, fase: 'consultando' }
}

// Checa uma consulta já em andamento. Devolve true quando terminou
// (sucesso ou erro definitivo) — o chamador limpa o andamento nesse caso.
// Só considera a mensagem "chegou de verdade" depois que o texto novo
// fica igual por 2 rodadas seguidas (~1,4s parado) — evita confundir com
// a tela ainda carregando/preenchendo campos.
async function verificarAndamento(numeroSistema, automation, andamento) {
  const textoNovo = automation.textoNovoDesde(andamento.fotoAntes)

  if (textoNovo && textoNovo === andamento.ultimoTextoNovo) {
    andamento.estavel += 1
  } else {
    andamento.estavel = 0
  }
  andamento.ultimoTextoNovo = textoNovo

  const decorrido = Date.now() - andamento.iniciadoEm

  if (andamento.fase === 'buscando') {
    // "não encontrado" já na busca (empresa de verdade não existe) — pode
    // parar por aqui, sem tentar consultar crédito de algo que não existe.
    if (textoNovo && andamento.estavel >= 2 && automation.ehNaoEncontrado(textoNovo)) {
      log(numeroSistema, 'CNPJ não encontrado na busca:', textoNovo)
      await salvarResultado(andamento.consulta.id, numeroSistema, { resultado: 'nao_encontrado', motivo: textoNovo })
      return true
    }

    // a busca deve ter carregado os dados da empresa — tenta achar o
    // botão de consultar (Solicitar/Avançar) pra seguir pra próxima fase.
    const botaoConsultar = automation.acharBotaoPorTexto(EASYVENDAS_SELECTORS.botaoAvancarTextos)
    if (botaoConsultar) {
      log(numeroSistema, 'Achou o botão de consultar depois da busca. Texto visto na busca:', textoNovo || '(nada)')
      andamento.fotoAntes = automation.tirarFotoTexto()
      botaoConsultar.click()
      andamento.fase = 'consultando'
      andamento.ultimoTextoNovo = ''
      andamento.estavel = 0
      andamento.iniciadoEm = Date.now() // reinicia o prazo pra essa fase
      return false
    }

    if (decorrido < TIMEOUT_ANDAMENTO_MS) return false
    await salvarResultado(andamento.consulta.id, numeroSistema, {
      erro: `[${numeroSistema}º sistema] busquei o CNPJ mas não achei o botão de consultar depois — url: ${location.href} — texto visto na busca: ${textoNovo || '(nada)'}`,
    })
    return true
  }

  // fase 'consultando'
  if (textoNovo && andamento.estavel >= 2) {
    log(numeroSistema, 'Mensagem de resultado:', textoNovo)
    const resultado = automation.ehNaoEncontrado(textoNovo)
      ? 'nao_encontrado'
      : automation.classificarMensagem(textoNovo, numeroSistema)
    log(numeroSistema, 'Resultado:', resultado)
    await salvarResultado(andamento.consulta.id, numeroSistema, { resultado, motivo: textoNovo })
    return true
  }

  if (decorrido < TIMEOUT_ANDAMENTO_MS) return false // ainda dentro do prazo, tenta de novo na próxima rodada

  await salvarResultado(andamento.consulta.id, numeroSistema, {
    erro: `[${numeroSistema}º sistema] não vi mensagem de resultado a tempo — url: ${location.href} — texto novo visto: ${textoNovo || '(nada)'}`,
  })
  return true
}

async function laco(numeroSistema, automation) {
  let andamento = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      if (andamento) {
        const terminou = await verificarAndamento(numeroSistema, automation, andamento)
        if (terminou) andamento = null
      } else {
        andamento = await tentarComecarNova(numeroSistema, automation)
      }
    } catch (err) {
      log(numeroSistema, 'Falha no laço:', err.message)
      andamento = null
    }
    await dormir(andamento ? POLL_ANDAMENTO_MS : POLL_IDLE_MS)
  }
}

async function iniciar() {
  const numeroSistema = await pegarNumeroSistema()
  log(numeroSistema, 'Ativo em', location.href)

  const automation = new EasyVendasAutomation(EASYVENDAS_SELECTORS)
  laco(numeroSistema, automation)

  // se a pessoa trocar a escolha dessa aba no ícone da extensão, o
  // background.js manda recarregar pra já começar a valer.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'crivo:recarregar') location.reload()
  })
}

iniciar()
