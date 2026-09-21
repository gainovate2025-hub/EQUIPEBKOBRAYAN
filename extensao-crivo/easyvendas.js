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

const POLL_IDLE_MS = 1500 // sem consulta em andamento: procura pendente de tanto em tanto
const POLL_ANDAMENTO_MS = 400 // com consulta em andamento: checa a tela rápido
const TIMEOUT_ANDAMENTO_MS = 25000 // tempo máximo esperando a mensagem de resultado antes de desistir (buscas de CNPJ podem demorar)
const ESTAVEL_MIN = 7 // rodadas seguidas com o mesmo texto novo antes de aceitar como resultado final (~2,8s, igual antes — só poll mais rápido) — a tela pode mostrar um texto de passagem (tipo dados da empresa carregando) antes do resultado de verdade aparecer

// "Não encontrado" e erros (tela não carregou, serviço temporariamente
// indisponível, timeout etc.) às vezes são passageiros — antes de
// aceitar de vez, recarrega a página e tenta de novo algumas vezes.
// Guarda a contagem no sessionStorage porque o reload apaga tudo da
// memória (a extensão reinicia do zero e pega essa MESMA consulta de
// novo, já que ela continua "pendente").
const MAX_TENTATIVAS = 2
const chaveTentativas = (consultaId) => `crivo_tentativas_${consultaId}`

function tentativasFeitas(consultaId) {
  return Number(sessionStorage.getItem(chaveTentativas(consultaId)) || 0)
}

// ID desta aba (guardado no sessionStorage — sobrevive a reload da MESMA
// aba, mas cada aba/janela nova gera o seu). Usado pra "reivindicar" uma
// consulta antes de processar (veja migration_022_crivo_trava.sql) — sem
// isso, duas abas na mesma tela (ou uma aba antiga que não morreu depois
// de aberta outra) podiam pegar a MESMA consulta pendente e processar
// ela duas vezes ao mesmo tempo, atrapalhando uma a outra (visto ao vivo:
// "tá consultando 2 vezes").
const CHAVE_CLIENT_ID = 'crivo_client_id'
function pegarClientId() {
  let id = sessionStorage.getItem(CHAVE_CLIENT_ID)
  if (!id) {
    id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(CHAVE_CLIENT_ID, id)
  }
  return id
}
const CLIENT_ID = pegarClientId()

// Decide entre tentar de novo ou salvar o resultado/erro de vez — usado
// tanto pra "não encontrado" quanto pra QUALQUER erro (timeout, serviço
// indisponível, formulário não achado, campo inválido etc.).
//
// Pra tentar de novo, primeiro clica voltar (igual o botão voltar do
// navegador) e confere se isso já foi suficiente pra voltar pro
// formulário certo — só recarrega a página (mais lento, e sempre foi o
// jeito antigo) se voltar não resolveu.
async function finalizarComRetry(numeroSistema, consultaId, dados, automation) {
  const feitas = tentativasFeitas(consultaId)
  if (feitas < MAX_TENTATIVAS) {
    sessionStorage.setItem(chaveTentativas(consultaId), String(feitas + 1))
    log(numeroSistema, consultaId, `Tentativa ${feitas + 1}/${MAX_TENTATIVAS} falhou (${dados.erro || dados.resultado}), voltando pra tela pra tentar de novo`)
    automation.voltarUmaPagina()
    await dormir(1200)
    if (automation.detectarEstado().tipo !== 'formulario') {
      log(numeroSistema, consultaId, 'Voltar não foi suficiente, recarregando a página')
      location.reload()
    }
    return
  }
  sessionStorage.removeItem(chaveTentativas(consultaId))
  await salvarResultado(consultaId, numeroSistema, dados)
}

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

// Loga no console (sempre) E manda pro banco (quando tem uma consulta
// associada) — grava em crivo_logs (migration_023) pra dar pra
// diagnosticar um erro direto pelo Supabase depois, sem precisar pedir
// print do console de quem estava testando. Não espera a gravação
// terminar (fire-and-forget) nem deixa uma falha de rede quebrar o
// laço principal.
function log(numeroSistema, consultaId, ...args) {
  console.log(`[Crivo/EasyVendas #${numeroSistema}]`, ...args)
  if (!consultaId) return
  const mensagem = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  supaFetch('crivo_logs', {
    method: 'POST',
    body: JSON.stringify({ consulta_id: consultaId, numero_sistema: numeroSistema, mensagem }),
    prefer: 'return=minimal',
  }).catch(() => {})
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
//
// Antes de devolver a consulta, REIVINDICA ela (migration_022) — se
// outra aba já pegou essa mesma consulta há pouco, a reivindicação
// falha e aqui devolve null (como se não tivesse pendente), evitando
// que duas abas processem a mesma consulta ao mesmo tempo.
async function buscarPendente(numeroSistema) {
  const campoResultado = `sistema${numeroSistema}_resultado`
  let filtro = `status=eq.pendente&${campoResultado}=is.null`
  if (numeroSistema === 2) filtro += `&sistema1_resultado=eq.aprovado`

  const linhas = await supaFetch(
    `crivo_consultas?select=*&${filtro}&order=created_at.asc&limit=1`
  )
  const consulta = linhas?.[0]
  if (!consulta) return null

  const reivindicou = await supaFetch('rpc/crivo_reivindicar', {
    method: 'POST',
    body: JSON.stringify({ p_id: consulta.id, p_numero_sistema: numeroSistema, p_client_id: CLIENT_ID }),
  })
  if (!reivindicou) {
    log(numeroSistema, consulta.id, 'Consulta já está sendo processada por outra aba, ignorando por agora:', consulta.cnpj)
    return null
  }

  return consulta
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
// curso) se conseguiu agir na tela, null se não tinha pendente, ou
// undefined se ainda está tentando voltar pro formulário certo (não
// conta como erro — só espera a próxima rodada).
//
// No sistema 1: se tiver um CEP junto da consulta, preenche e busca ele
// PRIMEIRO (fase 'aguardando_cep') — ajuda a carregar o endereço da
// empresa antes do CNPJ (só existe nesse sistema — confirmado que o
// campo de CEP não existe no formulário do sistema 2).
//
// Nos DOIS sistemas: depois (ou direto, sem CEP), digita o CNPJ e clica
// na LUPA de busca dele, se achar uma (fase 'buscando') — é ela que
// carrega os dados obrigatórios da empresa (Razão Social, Endereço
// etc.); sem isso o Avançar dá "Formulário com pendências" mesmo com o
// CNPJ certo (bug real visto no sistema 2 — a extensão pulava a lupa e
// ia direto pro Avançar). Só tenta o botão de consultar direto se não
// achar nenhuma lupa na tela.
async function tentarComecarNova(numeroSistema, automation) {
  const consulta = await buscarPendente(numeroSistema)
  if (!consulta) return null

  log(numeroSistema, consulta.id, 'Processando CNPJ', consulta.cnpj)

  // fecha qualquer janela de resultado deixada aberta de antes, sem
  // depender disso pra decidir o estado da tela.
  automation.fecharModal()

  const estado = automation.detectarEstado()
  if (estado.tipo !== 'formulario') {
    // no sistema 1, um reload pode cair em outra tela (não direto no
    // formulário) — tenta navegar de volta (Clientes > Adicionar) antes
    // de considerar isso um erro de verdade.
    if (numeroSistema === 1 && automation.navegarParaAdicionarClientes()) {
      log(numeroSistema, consulta.id, 'Não achei o formulário — cliquei pra navegar de volta, espero a próxima rodada')
      return null
    }
    await finalizarComRetry(numeroSistema, consulta.id, {
      erro: `[${numeroSistema}º sistema] não achei o campo de CNPJ/botão na tela${mensagemDiagnostico(estado)}`,
    }, automation)
    return null
  }

  const base = { consulta, iniciadoEm: Date.now(), ultimoTextoNovo: '', estavel: 0 }

  if (numeroSistema === 1 && consulta.cep) {
    const campoCep = automation.acharCampoCep()
    if (campoCep) {
      log(numeroSistema, consulta.id, 'Preenchendo CEP fornecido:', consulta.cep)
      const fotoAntes = automation.tirarFotoTexto()
      automation.definirValorInput(campoCep, consulta.cep)
      const botaoBuscarCep = automation.acharBotaoBuscarCep(campoCep)
      if (botaoBuscarCep) botaoBuscarCep.click()
      return { ...base, fotoAntes, fase: 'aguardando_cep' }
    }
  }

  if (numeroSistema === 1) {
    const botaoBuscar = automation.acharBotaoBuscar()
    if (botaoBuscar) {
      log(numeroSistema, consulta.id, 'Digitando CNPJ e clicando na lupa de busca')
      const fotoAntes = automation.tirarFotoTexto()
      automation.digitarCnpj(estado.campoCnpj, consulta.cnpj)
      botaoBuscar.click()
      return { ...base, fotoAntes, fase: 'buscando' }
    }
  }

  // Sem lupa separada (sistema 2, sempre — confirmado que lá é só CNPJ +
  // Avançar) — só digita o CNPJ e ESPERA um pouco antes de clicar
  // Avançar (fase 'aguardando_dados'), dando tempo do site carregar
  // sozinho os dados obrigatórios da empresa (Razão Social, Endereço
  // etc.) que aparecem depois do CNPJ. Clicar Avançar rápido demais (sem
  // esperar) dava "Formulário com pendências" mesmo com o CNPJ certo —
  // um humano não tem esse problema só porque demora um pouco a mais
  // pra clicar.
  log(numeroSistema, consulta.id, 'Digitando CNPJ e esperando os dados da empresa carregarem antes de avançar')
  const fotoAntes = automation.tirarFotoTexto()
  automation.digitarCnpj(estado.campoCnpj, consulta.cnpj)
  return { ...base, fotoAntes, fase: 'aguardando_dados' }
}

// Classifica o texto novo, se der pra classificar. Devolve null se o
// texto não bate com NENHUMA palavra-chave conhecida (aí quem chama
// decide se espera mais ou aceita como aprovado por padrão).
function classificarSeReconhecido(automation, texto, numeroSistema) {
  if (!texto) return null
  if (automation.ehFormularioIncompleto(texto)) return 'formulario_incompleto'
  if (automation.ehNaoEncontrado(texto)) return 'nao_encontrado'
  const resultado = automation.classificarMensagem(texto, numeroSistema)
  return resultado === 'reprovado' ? 'reprovado' : null
}

// Checa uma consulta já em andamento. Devolve true quando terminou
// (sucesso ou erro definitivo) — o chamador limpa o andamento nesse caso.
//
// Um texto que bate com uma palavra-chave conhecida (reprovado ou não
// encontrado) é aceito NA HORA, sem esperar nada — é sinal forte,
// especialmente porque já vimos mensagem real ficar mudando de leve a
// cada rodada (nunca "parada" o suficiente) e isso dava timeout à toa.
// Só quando o texto NÃO bate com nada conhecido (candidato a aprovado
// por padrão) é que espera ficar igual por várias rodadas seguidas —
// esse é o caso arriscado, que já vimos pegar lixo de tela (tipo "CNPJ:
// ...") em vez do resultado de verdade.
async function verificarAndamento(numeroSistema, automation, andamento) {
  const textoNovo = automation.textoNovoDesde(andamento.fotoAntes)

  if (textoNovo && textoNovo === andamento.ultimoTextoNovo) {
    andamento.estavel += 1
  } else {
    andamento.estavel = 0
  }
  andamento.ultimoTextoNovo = textoNovo

  const decorrido = Date.now() - andamento.iniciadoEm
  const reconhecido = classificarSeReconhecido(automation, textoNovo, numeroSistema)

  // fase 'aguardando_cep': preencheu o CEP e clicou na lupa dele — espera
  // um pouco (ou até aparecer algo novo, tipo o endereço carregado) antes
  // de seguir pro CNPJ, dando tempo do endereço vir.
  if (andamento.fase === 'aguardando_cep') {
    const tempoMinimoPassou = decorrido >= 1200
    if (textoNovo || tempoMinimoPassou) {
      const estadoAgora = automation.detectarEstado()
      if (estadoAgora.tipo === 'formulario') {
        log(numeroSistema, andamento.consulta.id, 'Endereço do CEP carregado, digitando CNPJ agora')
        const fotoAntes = automation.tirarFotoTexto()
        automation.digitarCnpj(estadoAgora.campoCnpj, andamento.consulta.cnpj)
        const botaoBuscar = automation.acharBotaoBuscar()
        if (botaoBuscar) botaoBuscar.click()
        andamento.fotoAntes = fotoAntes
        andamento.fase = 'buscando'
        andamento.ultimoTextoNovo = ''
        andamento.estavel = 0
        andamento.iniciadoEm = Date.now()
        return false
      }
    }

    if (decorrido < TIMEOUT_ANDAMENTO_MS) return false
    await finalizarComRetry(numeroSistema, andamento.consulta.id, {
      erro: `[${numeroSistema}º sistema] preenchi o CEP mas não consegui seguir pro CNPJ — url: ${location.href}`,
    }, automation)
    return true
  }

  // fase 'aguardando_dados': digitou o CNPJ mas não tem lupa separada
  // (sistema 2) — espera um tempo mínimo E confere se ainda tem campo
  // obrigatório vazio/inválido na tela (camposInvalidosVisiveis) antes de
  // clicar Avançar. Só tempo fixo (2,5s) não foi suficiente algumas
  // vezes — os dados da empresa podem demorar mais que isso pra
  // carregar, e clicar antes dava "Formulário com pendências" de novo.
  if (andamento.fase === 'aguardando_dados') {
    const tempoMinimoPassou = decorrido >= 4000
    const invalidos = tempoMinimoPassou ? automation.camposInvalidosVisiveis() : null

    if (tempoMinimoPassou && invalidos.length === 0) {
      const estadoAgora = automation.detectarEstado()
      if (estadoAgora.tipo === 'formulario') {
        log(numeroSistema, andamento.consulta.id, 'Campos da empresa validados, clicando Avançar agora')
        andamento.fotoAntes = automation.tirarFotoTexto()
        estadoAgora.botaoAvancar.click()
        andamento.fase = 'consultando'
        andamento.ultimoTextoNovo = ''
        andamento.estavel = 0
        andamento.iniciadoEm = Date.now()
        return false
      }
    }

    if (decorrido < TIMEOUT_ANDAMENTO_MS) return false
    const dicaInvalidos = invalidos?.length ? ` — campos ainda inválidos: ${invalidos.join(' | ')}` : ''
    await finalizarComRetry(numeroSistema, andamento.consulta.id, {
      erro: `[${numeroSistema}º sistema] digitei o CNPJ mas não consegui clicar Avançar — url: ${location.href}${dicaInvalidos}`,
    }, automation)
    return true
  }

  if (andamento.fase === 'buscando') {
    // "não encontrado" já na busca (empresa de verdade não existe) — pode
    // parar por aqui, sem tentar consultar crédito de algo que não existe.
    if (reconhecido === 'nao_encontrado') {
      log(numeroSistema, andamento.consulta.id, 'CNPJ não encontrado na busca:', textoNovo)
      await finalizarComRetry(numeroSistema, andamento.consulta.id, { resultado: 'nao_encontrado', motivo: textoNovo }, automation)
      return true
    }

    // a busca deve ter carregado os dados da empresa — tenta achar o
    // botão de consultar (Solicitar/Avançar) pra seguir pra próxima fase.
    const botaoConsultar = automation.acharBotaoPorTexto(EASYVENDAS_SELECTORS.botaoAvancarTextos)
    if (botaoConsultar) {
      log(numeroSistema, andamento.consulta.id, 'Achou o botão de consultar depois da busca. Texto visto na busca:', textoNovo || '(nada)')
      andamento.fotoAntes = automation.tirarFotoTexto()
      botaoConsultar.click()
      andamento.fase = 'consultando'
      andamento.ultimoTextoNovo = ''
      andamento.estavel = 0
      andamento.iniciadoEm = Date.now() // reinicia o prazo pra essa fase
      return false
    }

    if (decorrido < TIMEOUT_ANDAMENTO_MS) return false
    await finalizarComRetry(numeroSistema, andamento.consulta.id, {
      erro: `[${numeroSistema}º sistema] busquei o CNPJ mas não achei o botão de consultar depois — url: ${location.href} — texto visto na busca: ${textoNovo || '(nada)'}`,
    }, automation)
    return true
  }

  // fase 'consultando'

  // Já clicou voltar por ter caído na tela de Contrato — espera sair
  // dela antes de voltar a olhar o texto normalmente (enquanto ainda tá
  // nela, ignora tudo: não conta tempo de timeout nem lê texto novo,
  // senão o texto da própria tela de Contrato pode ser lido como
  // resultado por engano).
  if (andamento.aguardandoSairDoContrato) {
    if (!automation.pareceTelaDeContrato()) {
      log(numeroSistema, andamento.consulta.id, 'Saiu da tela de Contrato, voltando a acompanhar normalmente')
      andamento.aguardandoSairDoContrato = false
      andamento.fotoAntes = automation.tirarFotoTexto()
      andamento.ultimoTextoNovo = ''
      andamento.estavel = 0
      andamento.iniciadoEm = Date.now()
    }
    return false
  }

  // Caiu na tela de Contrato (Termo de Contratação) sem querer — não é
  // uma tela de resultado, e a extensão NUNCA clica em nada nela (nem
  // Salvar, nem Enviar por e-mail). Só clica voltar (igual o botão
  // voltar do navegador) e continua esperando a mensagem de resultado
  // de verdade aparecer, sem decidir nada por conta própria aqui.
  if (automation.pareceTelaDeContrato()) {
    log(numeroSistema, andamento.consulta.id, 'Caiu na tela de Contrato — voltando uma página e esperando o resultado')
    automation.voltarUmaPagina()
    andamento.aguardandoSairDoContrato = true
    return false
  }

  if (reconhecido || (textoNovo && andamento.estavel >= ESTAVEL_MIN)) {
    const resultado = reconhecido || automation.classificarMensagem(textoNovo, numeroSistema)
    log(numeroSistema, andamento.consulta.id, 'Mensagem de resultado:', textoNovo, '— Resultado:', resultado)
    if (resultado === 'formulario_incompleto') {
      // Não é resultado, é erro — o formulário não estava completo
      // quando clicou Avançar (nunca grava aprovado/reprovado por isso).
      await finalizarComRetry(numeroSistema, andamento.consulta.id, {
        erro: `[${numeroSistema}º sistema] formulário ficou incompleto ao avançar (dados da empresa não carregaram a tempo) — url: ${location.href}`,
      }, automation)
    } else if (resultado === 'nao_encontrado') {
      await finalizarComRetry(numeroSistema, andamento.consulta.id, { resultado: 'nao_encontrado', motivo: textoNovo }, automation)
    } else {
      await salvarResultado(andamento.consulta.id, numeroSistema, { resultado, motivo: textoNovo })
    }
    return true
  }

  if (decorrido < TIMEOUT_ANDAMENTO_MS) return false // ainda dentro do prazo, tenta de novo na próxima rodada

  const invalidos = automation.camposInvalidosVisiveis()
  const dicaInvalidos = invalidos.length ? ` — campos inválidos na tela: ${invalidos.join(' | ')}` : ''
  await finalizarComRetry(numeroSistema, andamento.consulta.id, {
    erro: `[${numeroSistema}º sistema] não vi mensagem de resultado a tempo — url: ${location.href} — texto novo visto: ${textoNovo || '(nada)'}${dicaInvalidos}`,
  }, automation)
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
      log(numeroSistema, andamento?.consulta?.id || null, 'Falha no laço:', err.message)
      andamento = null
    }
    await dormir(andamento ? POLL_ANDAMENTO_MS : POLL_IDLE_MS)
  }
}

async function iniciar() {
  const numeroSistema = await pegarNumeroSistema()
  log(numeroSistema, null, 'Ativo em', location.href)

  const automation = new EasyVendasAutomation(EASYVENDAS_SELECTORS)
  laco(numeroSistema, automation)

  // se a pessoa trocar a escolha dessa aba no ícone da extensão, o
  // background.js manda recarregar pra já começar a valer.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'crivo:recarregar') location.reload()
  })
}

iniciar()
