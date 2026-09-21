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

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

function log(...args) {
  console.log('[PortalParcelamento/bg]', ...args)
}

async function pegarConfig() {
  const { pp_config: config } = await chrome.storage.local.get('pp_config')
  return config || null
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
  const config = await pegarConfig()
  if (!config?.ligado || !config.webAppUrl || !config.sheetId || !config.abaNome) return

  const jobAtual = await pegarJob()
  if (jobAtual?.ativo) return // já tem um cliente em andamento

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
  const config = await pegarConfig()
  const job = await pegarJob()
  if (!job) return
  try {
    await marcarResultado(config, job.linha, valorColuna)
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    const job = await pegarJob()

    if (msg?.tipo === 'pp:semFatura') {
      log('Sem fatura para', job?.custcode)
      await encerrarClienteAtual('não tem fatura')
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

    if (msg?.tipo === 'pp:configurar') {
      await chrome.storage.local.set({ pp_config: msg.config })
      sendResponse({ ok: true })
      return
    }

    if (msg?.tipo === 'pp:ligar') {
      const config = (await pegarConfig()) || {}
      await chrome.storage.local.set({ pp_config: { ...config, ligado: true } })
      tentarProximoCiclo()
      sendResponse({ ok: true })
      return
    }

    if (msg?.tipo === 'pp:desligar') {
      const config = (await pegarConfig()) || {}
      await chrome.storage.local.set({ pp_config: { ...config, ligado: false } })
      sendResponse({ ok: true })
      return
    }

    if (msg?.tipo === 'pp:status') {
      sendResponse({ config: await pegarConfig(), job: await pegarJob() })
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
