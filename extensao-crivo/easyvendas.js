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

// CEP padrão configurado no painel (Crivo > Configurações) — usado quando
// uma consulta não veio com um CEP específico, principalmente pra
// reconstruir o formulário depois que ele trava (veja detectarEstado em
// easyvendas-automation.js: tipo 'travado') e precisa de CEP de novo pra
// seguir em frente. Guardado em memória e atualizado de tanto em tanto —
// se o supervisor trocar o valor no painel, a aba já aberta pega o valor
// novo sozinha, sem precisar recarregar.
let cepPadrao = null
async function atualizarCepPadrao() {
  try {
    const linhas = await supaFetch('crivo_configuracoes?select=cep_padrao&id=eq.1&limit=1')
    const novo = linhas?.[0]?.cep_padrao || null
    if (novo !== cepPadrao) {
      console.log('[Crivo/EasyVendas] CEP padrão atualizado:', novo || '(vazio)')
    }
    cepPadrao = novo
  } catch (err) {
    console.log('[Crivo/EasyVendas] Falha ao buscar CEP padrão:', err.message)
    // mantém o valor anterior em caso de falha de rede — não derruba nada
  }
}
const ATUALIZAR_CEP_PADRAO_MS = 60000

const POLL_IDLE_MS = 500 // sem consulta em andamento: procura pendente de tanto em tanto. Reduzido de 1500 pra 500 (29/10/2026) — pedido do Brayan pra melhorar o tempo de resposta: era o tempo que um CNPJ novo mandado pelo chat ficava esperando até a extensão nem percebido que tinha chegado.
const POLL_ANDAMENTO_MS = 150 // com consulta em andamento: checa a tela rápido. Reduzido de 400 pra 150 (26/10/2026) — pedido do Brayan pra responder mais rápido; os casos já reconhecidos (reprovado/negado/não encontrado) são aceitos na hora, sem esperar rodada nenhuma (veja mais abaixo), então esse valor só afeta a granularidade de QUANDO a extensão percebe que o texto novo apareceu.
const TIMEOUT_ANDAMENTO_MS = 90000 // tempo máximo esperando a mensagem de resultado antes de desistir (buscas de CNPJ podem demorar) — aumentado de 45s pra 90s (29/10/2026) — com 3 pessoas usando ao mesmo tempo, o EasyVendas fica mais lento pra responder, e 45s tava curto: a extensão desistia achando que tinha travado, recarregava a página e mandava o MESMO CNPJ de novo enquanto a resposta de verdade ainda tava a caminho (visto ao vivo: "consulta duas vezes o mesmo cnpj"). Quanto mais gente usando ao mesmo tempo, maior esse tempo precisa ser.
const ESTAVEL_MIN = 2 // rodadas seguidas com o mesmo texto novo antes de aceitar como resultado final (~300ms, com o POLL_ANDAMENTO_MS de 150 acima) — a tela pode mostrar um texto de passagem (tipo dados da empresa carregando) antes do resultado de verdade aparecer, por isso não cai pra 1. Reduzido de 5 pra 2 (26/10/2026) — pedido do Brayan ("quero que a msg que aparece já vá direto pra aprovado/reprovado"); como ficou bem mais rápido pra checar (150ms em vez de 400ms), 2 rodadas já dá a mesma proteção contra texto de passagem de um jeito bem mais rápido (~300ms em vez de ~2s).

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

// Limite pro "tentar navegar de volta pro formulário" (sistema 1) — sem
// isso, se clicar em Clientes/Adicionar nunca chegasse de verdade no
// formulário (ex: depois de terminar uma consulta e a tela não voltar
// limpa pra próxima), a extensão ficava tentando pra sempre, rodada
// atrás de rodada, sem nunca desistir nem dar erro — travamento visto
// ao vivo bem na 2ª consulta em diante (a 1ª sempre começa direto no
// formulário, preparado manualmente antes de ligar).
const MAX_TENTATIVAS_NAVEGAR = 5
const chaveTentativasNavegar = (consultaId) => `crivo_nav_tentativas_${consultaId}`

function tentativasNavegarFeitas(consultaId) {
  return Number(sessionStorage.getItem(chaveTentativasNavegar(consultaId)) || 0)
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
    logErro(numeroSistema, consultaId, `Tentativa ${feitas + 1}/${MAX_TENTATIVAS} falhou (${dados.erro || dados.resultado}), voltando pra tela pra tentar de novo`)
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

// O Chrome desacelera (ou quase congela) os temporizadores de uma aba
// enquanto ela fica em segundo plano (ex: foco numa aba do P2B) — por
// isso a automação "parava do nada" até a pessoa clicar na página de
// volta (pedido do Brayan em 02/11/2026). Sem o código abaixo, clicar de
// volta não adiantava na hora: tinha que esperar o temporizador atrasado
// terminar sozinho, o que podia levar bem mais que o tempo normal. Agora,
// assim que a aba fica visível de novo, a espera é encerrada na hora.
function dormir(ms) {
  return new Promise((resolve) => {
    let concluido = false
    const concluir = () => {
      if (concluido) return
      concluido = true
      clearTimeout(temporizador)
      document.removeEventListener('visibilitychange', aoFicarVisivel)
      resolve()
    }
    const temporizador = setTimeout(concluir, ms)
    function aoFicarVisivel() {
      if (document.visibilityState === 'visible') concluir()
    }
    document.addEventListener('visibilitychange', aoFicarVisivel)
  })
}

// Descobre pela URL da própria aba se é o 1º ou o 2º sistema — não
// depende de escolha manual (fonte de erro antiga: aba marcada errada).
function detectarSistemaPelaUrl() {
  if (location.href.includes('/negociacao/primeiravenda')) return 2
  if (location.href.includes('/cliente/')) return 1
  return null
}

// 1.6.0 (12/11/2026): 3 PCs. Cada PC tem uma aba no 1º sistema (cliente)
// e outra no 2º (negociação). O número do PC vem do ícone da extensão.
// Ordem de decisão do sistema da aba:
// 1. Sistema escolhido no ícone PRA ESSA ABA (1º ou 2º). Também fica
//    guardado na própria aba (sessionStorage), então vale de novo depois
//    de F5 ou do Chrome reabrir as abas.
// 2. Endereço da aba (/cliente/ = 1º, /negociacao/primeiravenda = 2º).
// 3. Sem nada disso: 1º sistema.
const CHAVE_SISTEMA_ABA = 'crivo_sistema_aba'
let NUMERO_PC = null // 1, 2 ou 3 — sem escolha, a aba não pega nada

async function pegarNumeroSistema() {
  let resp = null
  try {
    resp = await chrome.runtime.sendMessage({ tipo: 'crivo:pegarSistema' })
  } catch {
    // extensão atualizada sem F5 nessa aba: segue com o que a aba lembra
  }
  NUMERO_PC = [1, 2, 3].includes(resp?.pc) ? resp.pc : null
  if (resp?.aba === 1 || resp?.aba === 2) {
    sessionStorage.setItem(CHAVE_SISTEMA_ABA, String(resp.aba))
    return resp.aba
  }
  const lembrado = Number(sessionStorage.getItem(CHAVE_SISTEMA_ABA))
  if (lembrado === 1 || lembrado === 2) {
    // Chrome reabriu a aba com outro id: devolve a escolha pro background
    chrome.runtime.sendMessage({ tipo: 'crivo:lembrarSistemaDaAba', numero: lembrado }).catch(() => {})
    return lembrado
  }
  return detectarSistemaPelaUrl() || 1
}

// Loga no console (sempre) E manda pro banco (quando tem uma consulta
// associada) — grava em crivo_logs (migration_023) pra dar pra
// diagnosticar um erro direto pelo Supabase depois, sem precisar pedir
// print do console de quem estava testando. Não espera a gravação
// terminar (fire-and-forget) nem deixa uma falha de rede quebrar o
// laço principal.
// logErro: mesma coisa, mas marcado como erro (aparece na aba Log do site).
function log(numeroSistema, consultaId, ...args) {
  gravarLog('info', numeroSistema, consultaId, args)
}
function logErro(numeroSistema, consultaId, ...args) {
  gravarLog('erro', numeroSistema, consultaId, args)
}
function gravarLog(tipo, numeroSistema, consultaId, args) {
  console.log(`[Crivo/EasyVendas ${NUMERO_PC ? `PC ${NUMERO_PC} ` : ''}#${numeroSistema}]`, ...args)
  if (!consultaId) return
  const mensagem = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  supaFetch('crivo_logs', {
    method: 'POST',
    body: JSON.stringify({ consulta_id: consultaId, numero_sistema: numeroSistema, pc: NUMERO_PC, tipo, mensagem }),
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

// Pede pro banco o próximo CNPJ da fila pra este PC (1.6.0, veja
// migration_053_crivo_3_pcs.sql > crivo_pegar). O banco decide tudo de
// uma vez, sem duas abas/PCs pegarem o mesmo:
// * 1º sistema: CNPJ novo da fila (ou o que já é deste PC, num retry).
// * 2º sistema: CNPJ que este PC aprovou no 1º.
// * Só entrega se os DOIS sistemas deste PC estiverem conectados.
// * CNPJ parado há mais de 1m50 em outro PC (ou PC que caiu) volta pra
//   fila e outro PC pega.
// * Nunca entrega dois pendentes do mesmo CNPJ ao mesmo tempo.
async function buscarPendente(numeroSistema) {
  const linhas = await supaFetch('rpc/crivo_pegar', {
    method: 'POST',
    body: JSON.stringify({ p_pc: NUMERO_PC, p_sistema: numeroSistema, p_client_id: CLIENT_ID }),
  })
  return linhas?.[0] || null
}

// Sinal de vida: avisa o banco a cada 5s que esta aba (PC + sistema) está
// aberta. É assim que o site e o ícone sabem se os 2 sistemas do PC estão
// conectados, e um PC com um sistema fora não recebe CNPJ.
const SINAL_MS = 5000
let ultimoSinal = 0
async function mandarSinal(numeroSistema, consultaId) {
  if (Date.now() - ultimoSinal < SINAL_MS) return
  ultimoSinal = Date.now()
  try {
    await supaFetch('rpc/crivo_sinal', {
      method: 'POST',
      body: JSON.stringify({
        p_pc: NUMERO_PC,
        p_sistema: numeroSistema,
        p_client_id: CLIENT_ID,
        p_url: location.href,
        p_consulta_id: consultaId || null,
      }),
      prefer: 'return=minimal',
    })
  } catch {
    // falha de rede passageira: manda de novo daqui a 5s
  }
}

// Grava pela função do banco (RPC), não direto na tabela — veja
// migration_017_crivo_rpc.sql pro motivo.
// 1.6.0: só grava se o CNPJ ainda for deste PC. Erro não vai direto pro
// chat: o banco tenta mandar pra outro PC conectado primeiro.
async function salvarResultado(id, numeroSistema, { resultado = null, motivo = null, erro = null }) {
  const r = await supaFetch('rpc/crivo_salvar_resultado_pc', {
    method: 'POST',
    body: JSON.stringify({
      p_id: id,
      p_pc: NUMERO_PC,
      p_sistema: numeroSistema,
      p_client_id: CLIENT_ID,
      p_resultado: resultado,
      p_motivo: motivo,
      p_erro: erro,
    }),
  })
  if (r === 'repassado') console.log(`[Crivo/EasyVendas PC ${NUMERO_PC} #${numeroSistema}] Deu erro aqui, o CNPJ foi pra outro PC`)
  if (r === 'ignorado') console.log(`[Crivo/EasyVendas PC ${NUMERO_PC} #${numeroSistema}] Resultado não gravado: o CNPJ já tinha ido pra outro PC`)
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

  // 1.6.1 (13/11/2026, pedido do Brayan): no 1º sistema, SEMPRE recarrega
  // a página antes de cada consulta e refaz todos os passos do zero. O
  // banco (migration_056) manda consultar 2 vezes; cada leitura começa com
  // a página recarregada. Uma marca no sessionStorage (sobrevive ao reload)
  // evita recarregar em loop: depois do reload o mesmo CNPJ volta pra esta
  // aba e aí segue normal.
  if (numeroSistema === 1) {
    const leitura = consulta.sistema1_leitura1 ? 2 : 1
    const chaveRecarga = `crivo_recarregou_${consulta.id}_${leitura}`
    if (!sessionStorage.getItem(chaveRecarga)) {
      sessionStorage.setItem(chaveRecarga, '1')
      log(numeroSistema, consulta.id, `Recarregando a página antes da ${leitura}ª leitura do CNPJ ${consulta.cnpj}`)
      await dormir(300)
      location.reload()
      return null
    }
  }

  log(numeroSistema, consulta.id, 'Processando CNPJ', consulta.cnpj)

  // fecha qualquer janela de resultado deixada aberta de antes, sem
  // depender disso pra decidir o estado da tela.
  automation.fecharModal()

  const estado = automation.detectarEstado()
  if (estado.tipo !== 'formulario') {
    // no sistema 1, um reload pode cair em outra tela (não direto no
    // formulário) — tenta navegar de volta (Clientes > Adicionar) antes
    // de considerar isso um erro de verdade. Só até MAX_TENTATIVAS_NAVEGAR
    // vezes — depois disso, desiste e trata como erro de verdade (senão
    // fica tentando pra sempre sem nunca desistir).
    const tentativasNavegar = tentativasNavegarFeitas(consulta.id)
    let navegou = false
    if (numeroSistema === 1 && tentativasNavegar < MAX_TENTATIVAS_NAVEGAR) {
      navegou = await automation.navegarParaAdicionarClientes()
    }
    if (navegou) {
      sessionStorage.setItem(chaveTentativasNavegar(consulta.id), String(tentativasNavegar + 1))
      log(numeroSistema, consulta.id, `Não achei o formulário — cliquei pra navegar de volta (tentativa ${tentativasNavegar + 1}/${MAX_TENTATIVAS_NAVEGAR}), espero a próxima rodada`)
      return null
    }
    await finalizarComRetry(numeroSistema, consulta.id, {
      erro: `[${numeroSistema}º sistema] não achei o campo de CNPJ/botão na tela${mensagemDiagnostico(estado)}`,
    }, automation)
    return null
  }

  const base = { consulta, iniciadoEm: Date.now(), reservaRenovadaEm: Date.now(), ultimoTextoNovo: '', estavel: 0 }

  // Usa o CEP da própria consulta quando tem um; senão cai pro CEP padrão
  // configurado no painel (Crivo > Configurações) — sem nenhum dos dois,
  // esse campo (obrigatório na tela) fica vazio e o Avançar/Solicitar
  // nunca funciona.
  const cepParaUsar = consulta.cep || cepPadrao
  if (numeroSistema === 1) {
    log(numeroSistema, consulta.id, 'CEP a usar:', cepParaUsar || '(nenhum — consulta sem CEP e nenhum CEP padrão configurado)')
  }
  if (numeroSistema === 1 && cepParaUsar) {
    const campoCep = automation.acharCampoCep()
    if (!campoCep) {
      log(numeroSistema, consulta.id, 'Tinha CEP pra usar, mas não achei o campo de CEP nessa tela — seguindo direto pro CNPJ')
    }
    if (campoCep) {
      log(numeroSistema, consulta.id, consulta.cep ? 'Preenchendo CEP fornecido:' : 'Preenchendo CEP padrão do painel:', cepParaUsar)
      const fotoAntes = automation.tirarFotoTexto()
      automation.definirValorInput(campoCep, cepParaUsar)
      const botaoBuscarCep = automation.acharBotaoBuscarCep(campoCep)
      if (botaoBuscarCep) {
        await pausaHumana(300, 600)
        botaoBuscarCep.click()
      }
      return { ...base, fotoAntes, fase: 'aguardando_cep' }
    }
  }

  if (numeroSistema === 1) {
    const botaoBuscar = automation.acharBotaoBuscar()
    if (botaoBuscar) {
      log(numeroSistema, consulta.id, 'Digitando CNPJ e clicando na lupa de busca')
      const fotoAntes = automation.tirarFotoTexto()
      await automation.digitarCnpj(estado.campoCnpj, consulta.cnpj)
      await pausaHumana(300, 600)
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
  await automation.digitarCnpj(estado.campoCnpj, consulta.cnpj)
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
        await automation.digitarCnpj(estadoAgora.campoCnpj, andamento.consulta.cnpj)
        const botaoBuscar = automation.acharBotaoBuscar()
        if (botaoBuscar) {
          await pausaHumana(300, 600)
          botaoBuscar.click()
        }
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
    const tempoMinimoPassou = decorrido >= 2000 // reduzido de 4000 — a checagem de campos inválidos logo abaixo já é a garantia real, esse tempo é só pra não checar cedo demais
    const invalidos = tempoMinimoPassou ? automation.camposInvalidosVisiveis() : null

    if (tempoMinimoPassou && invalidos.length === 0) {
      const estadoAgora = automation.detectarEstado()
      if (estadoAgora.tipo === 'formulario') {
        log(numeroSistema, andamento.consulta.id, 'Campos da empresa validados, clicando Avançar agora')
        andamento.fotoAntes = automation.tirarFotoTexto()
        await pausaHumana(300, 600)
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
      await pausaHumana(300, 600)
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
  // Salvar, nem Enviar por e-mail). Confirmado ao vivo: essa tela aparece
  // quando o MESMO CNPJ é mandado duas vezes (reenvio de uma negociação
  // que já existe) — por isso, se isso acontecer numa consulta que JÁ
  // tinha passado por um retry antes (ou seja, esse reenvio pode ter sido
  // causado pela própria extensão desistindo cedo demais da 1ª tentativa
  // e tentando de novo), para por aqui e marca como erro pra conferência
  // manual, em vez de voltar e esperar mais — continuar o ciclo podia
  // levar a um 3º envio do mesmo CNPJ.
  if (automation.pareceTelaDeContrato()) {
    if (tentativasFeitas(andamento.consulta.id) > 0) {
      log(numeroSistema, andamento.consulta.id, 'Caiu na tela de Contrato de novo, depois de já ter tentado essa consulta antes — parando aqui (provável reenvio do mesmo CNPJ) pra não arriscar mandar um 3º envio.')
      automation.voltarUmaPagina()
      sessionStorage.removeItem(chaveTentativas(andamento.consulta.id))
      await salvarResultado(andamento.consulta.id, numeroSistema, {
        erro: `[${numeroSistema}º sistema] caiu na tela de Contrato depois de reenviar o mesmo CNPJ — provavelmente já tinha sido processado antes. Confere manualmente em vez de mandar de novo.`,
      })
      return true
    }
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

// Renova a reserva da consulta enquanto ela está sendo processada
// (10/11/2026). A reserva vence em 2 minutos (migration_042) pra outra aba
// poder assumir se esta travar, mas uma consulta lenta passa disso e
// outra máquina pegava o MESMO CNPJ. Renovando a cada 30s, cada máquina
// fica com o seu CNPJ e a reserva só vence se esta aba realmente parar.
// 1.6.0: devolve false quando o CNPJ já não é mais deste PC (demorou mais
// de 1m50 e foi repassado pra outro PC) — aí esta aba larga ele.
const RENOVAR_RESERVA_MS = 15000
async function renovarReserva(numeroSistema, andamento) {
  if (Date.now() - (andamento.reservaRenovadaEm || 0) < RENOVAR_RESERVA_MS) return true
  andamento.reservaRenovadaEm = Date.now()
  try {
    const aindaMeu = await supaFetch('rpc/crivo_renovar', {
      method: 'POST',
      body: JSON.stringify({ p_id: andamento.consulta.id, p_pc: NUMERO_PC, p_sistema: numeroSistema, p_client_id: CLIENT_ID }),
    })
    return aindaMeu !== false
  } catch {
    return true // falha de rede passageira: tenta de novo na próxima renovação
  }
}

async function laco(numeroSistema, automation) {
  let andamento = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await mandarSinal(numeroSistema, andamento?.consulta?.id)
      if (andamento && !(await renovarReserva(numeroSistema, andamento))) {
        log(numeroSistema, andamento.consulta.id, `PC ${NUMERO_PC} largou o CNPJ: ele foi repassado pra outro PC`)
        sessionStorage.removeItem(chaveTentativas(andamento.consulta.id))
        andamento = null
        automation.fecharModal()
      } else if (andamento) {
        const terminou = await verificarAndamento(numeroSistema, automation, andamento)
        if (terminou) andamento = null
      } else {
        andamento = await tentarComecarNova(numeroSistema, automation)
      }
    } catch (err) {
      logErro(numeroSistema, andamento?.consulta?.id || null, 'Falha no laço:', err.message)
      andamento = null
    }
    await dormir(andamento ? POLL_ANDAMENTO_MS : POLL_IDLE_MS)
  }
}

async function iniciar() {
  const numeroSistema = await pegarNumeroSistema()

  // se a pessoa trocar o PC ou o sistema no ícone da extensão, o
  // background.js manda recarregar pra já começar a valer.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'crivo:recarregar') location.reload()
  })

  if (!NUMERO_PC) {
    console.log('[Crivo/EasyVendas] Escolha o número deste PC (1, 2 ou 3) no ícone da extensão. Até lá esta aba não pega CNPJ.')
    return
  }
  log(numeroSistema, null, 'Ativo em', location.href)

  chrome.runtime.sendMessage({ tipo: 'crivo:abaAtiva' }).catch(() => {})

  await atualizarCepPadrao()
  setInterval(atualizarCepPadrao, ATUALIZAR_CEP_PADRAO_MS)

  const automation = new EasyVendasAutomation(EASYVENDAS_SELECTORS)
  laco(numeroSistema, automation)
}

iniciar()
