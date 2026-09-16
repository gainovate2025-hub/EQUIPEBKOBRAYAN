// easyvendas.js — Extensão Crivo (Easy Vendas)
// -----------------------------------------------------------------------
// Orquestra a automação: fica de olho na tabela crivo_consultas
// (Supabase) e, quando aparece uma consulta pendente, usa
// EasyVendasAutomation (easyvendas-automation.js) pra digitar o CNPJ,
// clicar AVANÇAR e ler o resultado da janela "Análise de crédito".
//
// ESTRATÉGIA (igual o projeto P2B — veja background/service-worker.js de
// lá): em vez de uma função só que clica e fica esperando dentro dela
// (que quebra se a tela navegar no meio), o laço abaixo roda em rodadas
// curtas chamando detectarEstado() a cada uma — lê a tela ATUAL e decide
// o próximo passo, igual uma pessoa faria. Se a tela navegar pra um
// lugar inesperado depois do clique, a PRÓXIMA rodada já percebe isso
// (estado 'desconhecido') em vez de travar numa espera cega de 15s.
//
// IMPORTANTE — como preparar a tela: essa extensão NÃO cria uma
// negociação nova sozinha. Antes de ligar, deixa a aba aberta numa tela
// de "Negociações" > "Dados do cliente" (não precisa ser de um cliente
// real — só usa o campo CNPJ pra consultar, nunca clica em SALVAR).
//
// O 1º e o 2º sistema são o MESMO site (só logins/contas diferentes),
// então essa mesma extensão serve pros dois — em cada ABA aberta no Easy
// Vendas, clica no ícone da extensão e escolhe se aquela aba é o "1º
// sistema" ou o "2º sistema" (guardado por aba pelo background.js).
//
// Não precisa de login nenhum aqui — usa a chave pública (anon) do
// Supabase, que só permite mexer em consultas ainda "pendente" (veja
// migration_013 e migration_017 — grava via RPC, não direto na tabela).

const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

const POLL_IDLE_MS = 5000 // sem consulta em andamento: procura pendente de tanto em tanto
const POLL_ANDAMENTO_MS = 700 // com consulta em andamento: checa a tela rápido (é aí que a modal aparece)
const TIMEOUT_ANDAMENTO_MS = 15000 // tempo máximo esperando a janela aparecer antes de desistir

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pegarNumeroSistema() {
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

async function buscarPendente(numeroSistema) {
  const campoResultado = `sistema${numeroSistema}_resultado`
  const linhas = await supaFetch(
    `crivo_consultas?select=*&status=eq.pendente&${campoResultado}=is.null&order=created_at.asc&limit=1`
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
// curso) se conseguiu clicar AVANÇAR, ou null se não tinha pendente.
async function tentarComecarNova(numeroSistema, automation) {
  const consulta = await buscarPendente(numeroSistema)
  if (!consulta) return null

  log(numeroSistema, 'Processando CNPJ', consulta.cnpj)
  const estado = automation.detectarEstado()

  if (estado.tipo === 'modal') {
    // uma janela de resultado antiga ainda aberta — fecha antes de começar
    automation.fecharModal()
    return { consulta, iniciadoEm: Date.now(), tentativas: 0 }
  }

  if (estado.tipo !== 'formulario') {
    await salvarResultado(consulta.id, numeroSistema, {
      erro: `[${numeroSistema}º sistema] não achei o formulário de CNPJ/botão AVANÇAR na tela${mensagemDiagnostico(estado)}`,
    })
    return null
  }

  automation.preencherEAvancar(estado, consulta.cnpj)
  return { consulta, iniciadoEm: Date.now(), tentativas: 0 }
}

// Checa uma consulta já em andamento (AVANÇAR já foi clicado). Devolve
// true quando terminou (sucesso ou erro definitivo) — o chamador limpa o
// andamento nesse caso.
async function verificarAndamento(numeroSistema, automation, andamento) {
  const estado = automation.detectarEstado()

  if (estado.tipo === 'modal') {
    log(numeroSistema, 'Mensagem da Análise de crédito:', estado.mensagem)
    automation.fecharModal()
    const resultado = automation.ehNaoEncontrado(estado.mensagem)
      ? 'nao_encontrado'
      : automation.classificarModal(estado.mensagem)
    log(numeroSistema, 'Resultado:', resultado)
    await salvarResultado(andamento.consulta.id, numeroSistema, { resultado, motivo: estado.mensagem })
    return true
  }

  const decorrido = Date.now() - andamento.iniciadoEm
  if (decorrido < TIMEOUT_ANDAMENTO_MS) return false // ainda dentro do prazo, tenta de novo na próxima rodada

  await salvarResultado(andamento.consulta.id, numeroSistema, {
    erro: `[${numeroSistema}º sistema] a janela "Análise de crédito" não apareceu a tempo${mensagemDiagnostico(estado)}`,
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
