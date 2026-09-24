// background.js — Extensão Portal Parcelamento
// -----------------------------------------------------------------------
// Coordena a aba do Portal: busca o próximo cliente pendente na planilha
// (via Apps Script — veja apps-script/Code.gs), abre/recarrega a aba, e
// quando o content script avisa que o e-mail foi enviado, escreve o
// resultado de volta na planilha ao final de cada fatura/cliente.
//
// PORTAL_URL sempre volta pra tela de seleção de contexto — nunca usamos
// "voltar" do navegador dentro do Portal (apps JSF/PrimeFaces quebram
// fácil com isso); em vez disso a extensão sempre recarrega do zero.
// -----------------------------------------------------------------------

const PORTAL_URL = 'https://portalparcelamento.timbrasil.com.br/pparcelamentos/appSgr/home/selecaoContexto.xhtml'
const MAX_TENTATIVAS_PORTAL = 2
const INTERVALO_CICLO_MINUTOS = 1

// Mesmo projeto Supabase do resto do painel-bko.
const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

function log(...args) {
  console.log('[PortalParcelamento/bg]', ...args)
}

function extrairSheetId(urlOuId) {
  const match = (urlOuId || '').match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : (urlOuId || '').trim()
}

// Config da planilha (Apps Script, planilha, aba, nomes das colunas) vem
// do Supabase — editada pelo supervisor no site (Automações > Portal
// Parcelamento). O "ligado/desligado" continua local a cada Chrome.
async function pegarConfigPlanilha() {
  const resposta = await fetch(
    `${SUPABASE_URL}/rest/v1/parcelamento_config?select=apps_script_url,sheet_url,aba_nome,coluna_custcode,coluna_email,coluna_telefone,coluna_status&id=eq.1&limit=1`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
  )
  if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`)
  const linhas = await resposta.json()
  const config = linhas?.[0]
  if (!config?.apps_script_url || !config?.sheet_url) return null
  return {
    webAppUrl: config.apps_script_url,
    sheetId: extrairSheetId(config.sheet_url),
    abaNome: config.aba_nome || 'Custo Code',
    colunaCustcode: config.coluna_custcode || 'CUSTCODE',
    colunaEmail: config.coluna_email || 'EMAIL',
    colunaTelefone: config.coluna_telefone || 'TELEFONE',
    colunaStatus: config.coluna_status || 'DATA DA FATURA',
  }
}

async function pegarLigado() {
  const { pp_ligado: ligado } = await chrome.storage.local.get('pp_ligado')
  return Boolean(ligado)
}

async function pegarJob() {
  const { pp_job: job } = await chrome.storage.session.get('pp_job')
  return job || null
}

async function salvarJob(job) {
  await chrome.storage.session.set({ pp_job: job })
}

async function limparJob() {
  await chrome.storage.session.remove('pp_job')
}

// Chama o Apps Script (GET pra ler, POST pra escrever). Manda os nomes
// das colunas configurados no site, pra funcionar em planilhas com
// cabeçalhos diferentes sem precisar editar o Apps Script.
async function chamarAppsScript(config, params, metodo = 'GET') {
  const url = new URL(config.webAppUrl)
  url.searchParams.set('sheetId', config.sheetId)
  url.searchParams.set('aba', config.abaNome)
  url.searchParams.set('colCustcode', config.colunaCustcode)
  url.searchParams.set('colEmail', config.colunaEmail)
  url.searchParams.set('colTelefone', config.colunaTelefone)
  url.searchParams.set('colStatus', config.colunaStatus)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const resposta = await fetch(url.toString(), { method: metodo, redirect: 'follow' })
  if (!resposta.ok) throw new Error(`Apps Script ${resposta.status}: ${await resposta.text()}`)
  return resposta.json()
}

async function buscarProximoPendente(config) {
  const resultado = await chamarAppsScript(config, { action: 'proximo' })
  return resultado?.linha ? resultado : null
}

async function marcarResultado(config, linha, valor) {
  await chamarAppsScript(config, { action: 'marcar', linha, valor })
}

async function abrirOuNavegar(urlBase, urlCompleta) {
  const [existente] = await chrome.tabs.query({ url: `${urlBase}*` })
  if (existente) {
    await chrome.tabs.update(existente.id, { url: urlCompleta, active: true })
    return existente.id
  }
  const nova = await chrome.tabs.create({ url: urlCompleta })
  return nova.id
}

async function abrirAbaPortal() {
  return abrirOuNavegar('https://portalparcelamento.timbrasil.com.br/', PORTAL_URL)
}

async function tentarProximoCiclo() {
  if (!(await pegarLigado())) return

  const jobAtual = await pegarJob()
  if (jobAtual?.ativo) return // já tem um cliente em andamento

  let config
  try {
    config = await pegarConfigPlanilha()
  } catch (err) {
    log('Erro ao buscar a configuração da planilha no Supabase:', err.message)
    return
  }
  if (!config) {
    log('Nenhuma planilha configurada ainda — configure em Automações > Portal Parcelamento no site.')
    return
  }

  let proximo
  try {
    proximo = await buscarProximoPendente(config)
  } catch (err) {
    log('Erro ao buscar próximo pendente na planilha:', err.message)
    return
  }
  if (!proximo) {
    log('Nenhum cliente pendente no momento.')
    return
  }

  log('Novo cliente:', proximo.custcode)
  await salvarJob({
    linha: proximo.linha,
    custcode: String(proximo.custcode),
    cliente: proximo.cliente || '',
    email: proximo.email || '',
    faturasProcessadas: [],
    tentativas: 0,
    ativo: true,
  })
  await abrirAbaPortal()
}

async function encerrarClienteAtual(valorColuna) {
  const job = await pegarJob()
  if (!job) return
  try {
    const config = await pegarConfigPlanilha()
    if (config) await marcarResultado(config, job.linha, valorColuna)
  } catch (err) {
    log('Erro ao gravar resultado na planilha:', err.message)
  }
  await limparJob()
  setTimeout(tentarProximoCiclo, 2000)
}

async function reiniciarPortalComMesmoJob(job) {
  await salvarJob(job)
  await abrirAbaPortal()
}

// Confirmado ao vivo pelo Brayan: colar (Ctrl+V) na mão SEMPRE funciona
// nos campos desse Portal — digitação simulada dá "Código do cliente
// inválido" de vez em quando. Em vez de simular digitação, manda o
// Chrome executar o comando de colar de VERDADE (o mesmo que roda
// quando alguém aperta Ctrl+V) no elemento focado, via CDP — o
// content-script já deixou o valor certo na área de transferência antes
// de chamar isso. Sem clique nenhum da pessoa — só aparece a faixa
// amarela do Chrome avisando "extensão depurando essa aba" no instante.
async function colarComDebugger(tabId) {
  const alvo = { tabId }
  log('debugger: anexando na aba', tabId)
  try {
    await chrome.debugger.attach(alvo, '1.3')
  } catch (err) {
    if (!String(err.message || '').includes('already attach')) throw err
  }
  log('debugger: anexado, colando')
  try {
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      commands: ['SelectAll'],
      key: 'a',
    })
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a' })
    await new Promise((r) => setTimeout(r, 150))
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      commands: ['Paste'],
      key: 'v',
    })
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'v' })
    log('debugger: colou')
  } finally {
    try {
      await chrome.debugger.detach(alvo)
      log('debugger: desanexado')
    } catch {
      // já pode ter se desanexado sozinho (ex: aba fechou) — ignora
    }
  }
}

// Nunca deixa o pedido do content script pendurado pra sempre — se o CDP
// travar por qualquer motivo, desiste depois de alguns segundos em vez
// de travar o fluxo inteiro esperando uma resposta que nunca chega.
function colarComDebuggerComTimeout(tabId) {
  return Promise.race([
    colarComDebugger(tabId),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout do CDP')), 8000)),
  ])
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    const job = await pegarJob()

    if (msg?.tipo === 'pp:semFatura') {
      log('Sem fatura para', job?.custcode)
      await encerrarClienteAtual('SEM FATURA')
      return
    }

    if (msg?.tipo === 'pp:clienteConcluido') {
      log('Cliente concluído:', job?.custcode)
      await encerrarClienteAtual('FATURA ENVIADA POR EMAIL')
      return
    }

    if (msg?.tipo === 'pp:erroPortal') {
      if (!job) return
      const tentativas = (job.tentativas || 0) + 1
      log(`Erro no Portal (tentativa ${tentativas}):`, msg.mensagem)
      if (tentativas >= MAX_TENTATIVAS_PORTAL) {
        await encerrarClienteAtual(`ERRO: ${msg.mensagem}`)
      } else {
        await reiniciarPortalComMesmoJob({ ...job, tentativas })
      }
      return
    }

    if (msg?.tipo === 'pp:emailEnviado') {
      if (!job) return
      log('E-mail enviado para', job.custcode, '— conferindo se há mais faturas')
      const faturasProcessadas = [...job.faturasProcessadas, msg.chaveFatura]
      await reiniciarPortalComMesmoJob({ ...job, faturasProcessadas, tentativas: 0 })
      return
    }

    if (msg?.tipo === 'pp:colarComDebugger') {
      try {
        await colarComDebuggerComTimeout(_sender.tab.id)
        sendResponse({ ok: true })
      } catch (err) {
        log('Falha ao colar via debugger:', err.message)
        sendResponse({ ok: false, erro: err.message })
      }
      return
    }

    if (msg?.tipo === 'pp:ligar') {
      await chrome.storage.local.set({ pp_ligado: true })
      tentarProximoCiclo()
      sendResponse({ ok: true })
      return
    }

    if (msg?.tipo === 'pp:desligar') {
      await chrome.storage.local.set({ pp_ligado: false })
      sendResponse({ ok: true })
      return
    }

    if (msg?.tipo === 'pp:status') {
      let config = null
      let erroConfig = null
      try {
        config = await pegarConfigPlanilha()
      } catch (err) {
        erroConfig = err.message
      }
      sendResponse({ ligado: await pegarLigado(), config, erroConfig, job: await pegarJob() })
      return
    }
  })()
  return true // resposta assíncrona
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pp_ciclo') tentarProximoCiclo()
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('pp_ciclo', { periodInMinutes: INTERVALO_CICLO_MINUTOS })
})
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('pp_ciclo', { periodInMinutes: INTERVALO_CICLO_MINUTOS })
})
