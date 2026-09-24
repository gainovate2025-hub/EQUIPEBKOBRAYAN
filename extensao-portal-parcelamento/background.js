// background.js — Extensão Portal Parcelamento
// -----------------------------------------------------------------------
// Coordena as duas abas (Portal Parcelamento e WhatsApp Web): busca o
// próximo cliente pendente na planilha (via Apps Script — veja
// apps-script/Code.gs), abre/recarrega a aba do Portal, e quando o
// content script de lá avisa que o PDF da fatura está pronto, abre a
// aba do WhatsApp já no chat certo, deixando o PDF pronto pra ele
// injetar. Escreve o resultado de volta na planilha ao final de cada
// cliente.
//
// PORTAL_URL sempre volta pra tela de seleção de contexto — nunca usamos
// "voltar" do navegador dentro do Portal (apps JSF/PrimeFaces quebram
// fácil com isso, dá erro de ViewState expirado); em vez disso a extensão
// sempre recarrega do zero e refaz a busca pelo Custcode, o que é mais
// lento mas muito mais confiável.
// -----------------------------------------------------------------------

const PORTAL_URL = 'https://portalparcelamento.timbrasil.com.br/pparcelamentos/appSgr/home/selecaoContexto.xhtml'
const MAX_TENTATIVAS_PORTAL = 2
const INTERVALO_CICLO_MINUTOS = 1

// Mesmo projeto Supabase do resto do painel-bko (veja extensao-crivo/easyvendas.js)
// — a extensão só LÊ a config daqui (RLS de parcelamento_config só deixa
// escrita pra supervisor logado no site; veja migration_022).
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

// Config da planilha (qual Apps Script, qual planilha, qual aba) vem do
// Supabase — editada pelo supervisor no site (tela Automações > Portal
// Parcelamento). O "ligado/desligado" continua local a cada Chrome (o
// popup controla isso), pra cada pessoa poder pausar a própria extensão
// sem depender do site.
async function pegarConfigPlanilha() {
  const resposta = await fetch(
    `${SUPABASE_URL}/rest/v1/parcelamento_config?select=apps_script_url,sheet_url,aba_nome&id=eq.1&limit=1`,
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

function dataDeHoje() {
  return new Date().toLocaleDateString('pt-BR')
}

function normalizarTelefone(numero) {
  const digitos = (numero || '').replace(/\D/g, '')
  if (digitos.length <= 11) return `55${digitos}`
  return digitos
}

// Chama o Apps Script (veja apps-script/Code.gs) — GET pra ler, POST pra
// escrever. O Web App roda com a conta Google de quem fez o deploy, então
// não precisa de nenhuma credencial guardada na extensão.
async function chamarAppsScript(config, params, metodo = 'GET') {
  const url = new URL(config.webAppUrl)
  url.searchParams.set('sheetId', config.sheetId)
  url.searchParams.set('aba', config.abaNome)
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

async function abrirAbaWhatsapp(telefone) {
  const url = `https://web.whatsapp.com/send?phone=${telefone}`
  return abrirOuNavegar('https://web.whatsapp.com/', url)
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
    telefone: normalizarTelefone(proximo.telefone),
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
  await chrome.storage.session.remove('pp_whatsapp_job')
  setTimeout(tentarProximoCiclo, 2000)
}

async function reiniciarPortalComMesmoJob(job) {
  await salvarJob(job)
  await abrirAbaPortal()
}

// NOVA ESTRATÉGIA: zero JavaScript mexendo no .value desse campo — nem
// pra limpar. Tudo feito via CDP, exatamente como uma pessoa faria na
// mão: seleciona tudo (Ctrl+A de verdade) e cola (Ctrl+V de verdade) por
// cima. Confirmado ao vivo pelo Brayan que colar na mão sempre funciona
// nesse campo — a permissão "clipboardWrite" no manifest garante que o
// content-script consegue copiar pra área de transferência mesmo sem
// clique da pessoa.
async function colarComDebugger(tabId) {
  const alvo = { tabId }
  log('debugger: anexando na aba', tabId)
  try {
    await chrome.debugger.attach(alvo, '1.3')
  } catch (err) {
    if (!String(err.message || '').includes('already attach')) throw err
  }
  log('debugger: anexado, selecionando tudo')
  try {
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      commands: ['SelectAll'],
      key: 'a',
    })
    await chrome.debugger.sendCommand(alvo, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a' })
    await new Promise((r) => setTimeout(r, 150))
    log('debugger: colando')
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
// travar por qualquer motivo (visto ao vivo: ficou preso sem erro nem
// resposta), desiste depois de alguns segundos em vez de travar o fluxo
// inteiro da automação esperando uma resposta que nunca chega.
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
      await encerrarClienteAtual('FATURA NÃO ENCONTRADA')
      return
    }

    if (msg?.tipo === 'pp:clienteConcluido') {
      log('Cliente concluído:', job?.custcode)
      await encerrarClienteAtual(dataDeHoje())
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

    if (msg?.tipo === 'pp:faturaPdfPronta') {
      if (!job) return
      log('PDF pronto para', job.custcode, '— abrindo WhatsApp para', job.telefone)
      const faturasProcessadas = [...job.faturasProcessadas, msg.chaveFatura]
      await salvarJob({ ...job, faturasProcessadas, tentativas: 0 })
      await chrome.storage.session.set({
        pp_whatsapp_job: {
          telefone: job.telefone,
          cliente: job.cliente,
          pdfBase64: msg.pdfBase64,
          nomeArquivo: `fatura_${job.custcode}.pdf`,
          comando: 'enviar',
        },
      })
      await abrirAbaWhatsapp(job.telefone)
      return
    }

    if (msg?.tipo === 'pp:faturaEnviada') {
      if (!job) return
      log('Fatura enviada por WhatsApp, voltando pro Portal para conferir se há mais faturas')
      await chrome.storage.session.remove('pp_whatsapp_job')
      await reiniciarPortalComMesmoJob(job)
      return
    }

    if (msg?.tipo === 'pp:erroWhatsapp') {
      log('Erro no WhatsApp:', msg.mensagem)
      await encerrarClienteAtual(`ERRO WHATSAPP: ${msg.mensagem}`)
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
