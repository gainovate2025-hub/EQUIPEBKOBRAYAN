// whatsapp.js — Extensão Portal Parcelamento (WhatsApp Web)
// -----------------------------------------------------------------------
// Espera o background.js deixar um "trabalho" (pp_whatsapp_job) no
// chrome.storage.session pra essa aba processar: manda o aviso da
// fatura, anexa o PDF, manda a cobrança, e avisa o background quando
// terminar (ou der erro).
//
// A aba já chega direto no chat certo, porque o background.js navega
// pra https://web.whatsapp.com/send?phone=<numero> — não precisa clicar
// em "+" nem digitar número na busca.
// -----------------------------------------------------------------------

const WA_POLL_MS = 500
const WA_TIMEOUT_MS = 25000

function waLog(...args) {
  console.log('[PortalParcelamento/WhatsApp]', ...args)
}

function dormirWA(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function aguardar(condicao, timeoutMs = WA_TIMEOUT_MS) {
  const inicio = Date.now()
  while (Date.now() - inicio < timeoutMs) {
    const resultado = condicao()
    if (resultado) return resultado
    await dormirWA(WA_POLL_MS)
  }
  return null
}

async function pegarJobWhatsapp() {
  const { pp_whatsapp_job: job } = await chrome.storage.session.get('pp_whatsapp_job')
  return job || null
}

async function avisarBackgroundWA(tipo, dados = {}) {
  try {
    await chrome.runtime.sendMessage({ tipo, ...dados })
  } catch (err) {
    waLog('Falha ao avisar o background:', err.message)
  }
}

async function rodarEnvio(job) {
  const automation = new WhatsappAutomation(WHATSAPP_SELECTORS)

  const caixa = await aguardar(() => automation.caixaMensagem())
  if (!caixa) {
    const invalido = automation.numeroPareceInvalido()
    await avisarBackgroundWA('pp:erroWhatsapp', {
      mensagem: invalido ? `número inválido/sem WhatsApp: ${job.telefone}` : 'não consegui abrir o chat a tempo',
    })
    return
  }

  waLog('Chat aberto, mandando aviso da fatura')
  await automation.digitarTexto(caixa, MENSAGENS.aviso(job.cliente))
  automation.enviarComEnter(caixa)
  await dormirWA(1500)

  waLog('Anexando PDF da fatura')
  if (!automation.clicarAnexar()) {
    await avisarBackgroundWA('pp:erroWhatsapp', { mensagem: 'não achei o botão de anexar' })
    return
  }
  await dormirWA(500)

  if (!automation.clicarOpcaoDocumento()) {
    await avisarBackgroundWA('pp:erroWhatsapp', { mensagem: 'não achei a opção "Documento" no menu de anexar' })
    return
  }
  await dormirWA(500)

  if (!automation.injetarArquivo(job.pdfBase64, job.nomeArquivo)) {
    await avisarBackgroundWA('pp:erroWhatsapp', { mensagem: 'não achei o campo de arquivo pra anexar o PDF' })
    return
  }

  const botaoEnviarAnexo = await aguardar(() => automation.clicarEnviarAnexo() || true, 8000)
  if (!botaoEnviarAnexo) {
    await avisarBackgroundWA('pp:erroWhatsapp', { mensagem: 'não consegui confirmar o envio do PDF anexado' })
    return
  }
  await dormirWA(2000)

  waLog('Mandando mensagem de cobrança')
  const caixaDeNovo = await aguardar(() => automation.caixaMensagem())
  if (caixaDeNovo) {
    await automation.digitarTexto(caixaDeNovo, MENSAGENS.cobranca(job.cliente))
    automation.enviarComEnter(caixaDeNovo)
    await dormirWA(1000)
  }

  await avisarBackgroundWA('pp:faturaEnviada', {})
}

async function iniciarWA() {
  const job = await pegarJobWhatsapp()
  if (!job || job.comando !== 'enviar') return
  waLog('Job de envio ativo para', job.telefone)
  await chrome.storage.session.set({ pp_whatsapp_job: { ...job, comando: 'em_andamento' } })
  await rodarEnvio(job)
}

iniciarWA()
