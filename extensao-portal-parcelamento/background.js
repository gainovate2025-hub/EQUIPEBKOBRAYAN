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
const MAX_TENTATIVAS_PORTAL = 4
const INTERVALO_CICLO_MINUTOS = 1

// Mesmo projeto Supabase do resto do painel-bko.
const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

// Log também no banco (tabela parcelamento_logs) — dá pra diagnosticar
// sem abrir o Console (que atrapalha o chrome.debugger).
function dbLog(origem, custcode, mensagem) {
  fetch(`${SUPABASE_URL}/rest/v1/parcelamento_logs`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ origem, custcode: custcode || null, mensagem: String(mensagem).slice(0, 2000) }),
  }).catch(() => {})
}

function log(...args) {
  console.log('[PortalParcelamento/bg]', ...args)
  pegarJob().then((j) => dbLog('background', j?.custcode, args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))).catch(() => {})
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

// Preenchimento de campo via CDP (chrome.debugger): eventos de teclado/
// colar REAIS do navegador, sem clique de ninguém. O Portal às vezes
// recusa o valor conforme o jeito que ele entra, então há 3 modos —
// 'colar' (comando Paste, valor já na área de transferência), 'teclas'
// (tecla por tecla com intervalo variável, igual pessoa digitando) e
// 'inserir' (Input.insertText). O content script tenta um, confere o
// campo e, se não bateu, pede o próximo.
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const aleatorio = (min, max) => min + Math.random() * (max - min)

function infoTecla(ch) {
  if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, vk: 48 + Number(ch) }
  if (/[a-zA-Z]/.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, vk: ch.toUpperCase().charCodeAt(0) }
  if (ch === '.') return { key: '.', code: 'Period', vk: 190 }
  if (ch === '@') return { key: '@', code: 'Digit2', vk: 50 }
  if (ch === '-') return { key: '-', code: 'Minus', vk: 189 }
  if (ch === '_') return { key: '_', code: 'Minus', vk: 189 }
  return { key: ch, code: '', vk: ch.toUpperCase().charCodeAt(0) }
}

async function anexarDebugger(alvo) {
  // Limpa um anexo antigo NOSSO que tenha ficado preso.
  try { await chrome.debugger.detach(alvo) } catch { /* não estava anexado */ }
  try {
    await chrome.debugger.attach(alvo, '1.3')
  } catch (err) {
    const m = String(err.message || '')
    if (m.includes('already attached') || m.includes('Another debugger')) {
      throw new Error('outra ferramenta de depuração está aberta nessa aba (feche o DevTools/F12)')
    }
    throw err
  }
}

async function cdpDigitar(tabId, modo, texto) {
  const alvo = { tabId }
  await anexarDebugger(alvo)
  const cmd = (m, p) => chrome.debugger.sendCommand(alvo, m, p)
  try {
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', commands: ['SelectAll'], key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 })
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 })
    await esperar(aleatorio(120, 260))

    if (modo === 'colar') {
      await cmd('Input.dispatchKeyEvent', { type: 'keyDown', commands: ['Paste'], key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 })
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 })
      return
    }

    // Apaga a seleção antes de escrever por cima.
    await cmd('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
    await esperar(aleatorio(120, 260))

    if (modo === 'inserir') {
      await cmd('Input.insertText', { text: texto })
      return
    }

    // modo 'teclas'
    for (const ch of texto) {
      const t = infoTecla(ch)
      await cmd('Input.dispatchKeyEvent', {
        type: 'keyDown', text: ch, unmodifiedText: ch, key: t.key, code: t.code, windowsVirtualKeyCode: t.vk,
      })
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: t.key, code: t.code, windowsVirtualKeyCode: t.vk })
      await esperar(aleatorio(60, 130) + (Math.random() < 0.08 ? aleatorio(250, 550) : 0))
    }
  } finally {
    try { await chrome.debugger.detach(alvo) } catch { /* já desanexou */ }
  }
}

// Clique de mouse REAL (evento do navegador, não element.click()): o
// ponteiro sai de um ponto qualquer e chega no alvo por uma curva com
// velocidade variável, pára um instante, aperta e solta com um tempinho
// entre os dois — como uma mão de verdade.
const ultimoPonteiro = {}
async function cdpClicar(tabId, x, y) {
  const alvo = { tabId }
  await anexarDebugger(alvo)
  const cmd = (m, p) => chrome.debugger.sendCommand(alvo, m, p)
  try {
    const ini = ultimoPonteiro[tabId] || { x: aleatorio(50, 400), y: aleatorio(50, 300) }
    const c1 = { x: ini.x + (x - ini.x) * 0.3 + aleatorio(-60, 60), y: ini.y + (y - ini.y) * 0.1 + aleatorio(-60, 60) }
    const c2 = { x: ini.x + (x - ini.x) * 0.8 + aleatorio(-25, 25), y: ini.y + (y - ini.y) * 0.9 + aleatorio(-25, 25) }
    const passos = Math.round(aleatorio(14, 26))
    for (let i = 1; i <= passos; i++) {
      const t = i / passos
      const u = 1 - t
      const px = u ** 3 * ini.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * x
      const py = u ** 3 * ini.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * y
      await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py })
      await esperar(aleatorio(8, 28))
    }
    ultimoPonteiro[tabId] = { x, y }
    await esperar(aleatorio(90, 260))
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await esperar(aleatorio(45, 130))
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  } finally {
    try { await chrome.debugger.detach(alvo) } catch { /* já desanexou */ }
  }
}

function cdpClicarComTimeout(tabId, x, y) {
  return Promise.race([
    cdpClicar(tabId, x, y),
    new Promise((_r, reject) => setTimeout(() => reject(new Error('timeout do CDP (clique)')), 15000)),
  ])
}

function cdpDigitarComTimeout(tabId, modo, texto) {
  return Promise.race([
    cdpDigitar(tabId, modo, texto),
    new Promise((_r, reject) => setTimeout(() => reject(new Error('timeout do CDP')), 30000)),
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
        const modoIdx = msg.trocarModo ? (Math.max(0, ['colar', 'teclas', 'inserir'].indexOf(msg.modoUsado)) + 1) % 3 : job.modoIdx
        await reiniciarPortalComMesmoJob({ ...job, tentativas, modoIdx })
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

    if (msg?.tipo === 'pp:cdpDigitar') {
      try {
        await cdpDigitarComTimeout(_sender.tab.id, msg.modo, msg.texto)
        sendResponse({ ok: true })
      } catch (err) {
        log(`Falha no CDP (${msg.modo}):`, err.message)
        sendResponse({ ok: false, erro: err.message })
      }
      return
    }

    if (msg?.tipo === 'pp:cdpClicar') {
      try {
        await cdpClicarComTimeout(_sender.tab.id, msg.x, msg.y)
        sendResponse({ ok: true })
      } catch (err) {
        log('Falha no clique CDP:', err.message)
        sendResponse({ ok: false, erro: err.message })
      }
      return
    }

    if (msg?.tipo === 'pp:log') {
      dbLog('pagina', msg.custcode, msg.mensagem)
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
