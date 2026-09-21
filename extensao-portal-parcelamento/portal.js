// portal.js — Extensão Portal Parcelamento
// -----------------------------------------------------------------------
// Orquestra a automação nessa aba: espera o background.js deixar um
// "trabalho" (pp_job) no chrome.storage.session pra essa aba processar —
// busca o Custcode, escolhe a fatura, confirma, escolhe Impressão Online,
// confirma de novo, e quando a tela vira o PDF, baixa ele (por fetch,
// usando os cookies da própria sessão) e avisa o background.js.
//
// MESMO PRINCÍPIO do Crivo (veja easyvendas.js): em vez de uma função só
// que clica e fica esperando (quebra se a tela atualizar no meio via
// AJAX da PrimeFaces), um laço curto olha o estado ATUAL da tela a cada
// rodada e decide o próximo passo.
//
// Quem tem mais de uma fatura em aberto: a extensão manda TODAS, uma de
// cada vez — depois de cada envio, o background.js recarrega essa aba no
// início (nunca usa "voltar" do navegador — apps JSF/PrimeFaces quebram
// fácil com o botão voltar, dá erro de ViewState expirado) e o job
// continua com a MESMA lista de faturas já enviadas (pp_job
// .faturasProcessadas), pra pular as que já foram e mandar só a próxima.
// -----------------------------------------------------------------------

const PP_POLL_MS = 800
const PP_TIMEOUT_MS = 30000

function ppLog(...args) {
  console.log('[PortalParcelamento]', ...args)
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pegarJob() {
  const { pp_job: job } = await chrome.storage.session.get('pp_job')
  return job || null
}

async function avisarBackground(tipo, dados = {}) {
  try {
    await chrome.runtime.sendMessage({ tipo, ...dados })
  } catch (err) {
    ppLog('Falha ao avisar o background:', err.message)
  }
}

async function rodarFluxo(job) {
  const automation = new PortalAutomation(PORTAL_SELECTORS)
  const inicio = Date.now()
  let faseAtual = 'busca'
  let jaBuscou = false

  while (true) {
    if (Date.now() - inicio > PP_TIMEOUT_MS && faseAtual !== 'aguardando_pdf_lento') {
      await avisarBackground('pp:erroPortal', { mensagem: `travou na fase "${faseAtual}" — url: ${location.href}` })
      return
    }

    try {
      if (faseAtual === 'busca') {
        const telaBusca = automation.detectarTelaBusca()
        if (telaBusca && !jaBuscou) {
          ppLog('Preenchendo Custcode e buscando:', job.custcode)
          automation.preencherEBuscar(job.custcode)
          jaBuscou = true
          await dormir(PP_POLL_MS)
          continue
        }
        if (!telaBusca && !jaBuscou) {
          // ainda carregando a tela inicial
          await dormir(PP_POLL_MS)
          continue
        }
        faseAtual = 'aguardando_resultado_busca'
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'aguardando_resultado_busca') {
        if (automation.pareceSemFatura()) {
          if (job.faturasProcessadas.length > 0) {
            // já mandou pelo menos uma fatura nessa rodada anterior — a
            // lista ficou vazia porque terminou, não porque nunca teve.
            await avisarBackground('pp:clienteConcluido', { linha: job.linha })
          } else {
            ppLog('Sem fatura em aberto para', job.custcode)
            await avisarBackground('pp:semFatura', { linha: job.linha })
          }
          return
        }

        const proxima = automation.proximaFaturaNaoProcessada(job.faturasProcessadas)
        if (proxima) {
          ppLog('Selecionando fatura:', proxima.chave.slice(0, 60))
          automation.selecionarFatura(proxima)
          job._faturaAtualChave = proxima.chave
          faseAtual = 'confirmando_fatura'
          await dormir(PP_POLL_MS)
          continue
        }

        // nem "sem fatura" nem lista de fatura visível ainda — pode estar
        // no meio do AJAX de busca. Espera mais um pouco.
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_fatura') {
        if (automation.clicarConfirmarFatura()) {
          faseAtual = 'impressao_online'
          await dormir(PP_POLL_MS)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'impressao_online') {
        if (automation.selecionarImpressaoOnline()) {
          faseAtual = 'confirmando_impressao'
          await dormir(300)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_impressao') {
        if (automation.clicarConfirmarGenerico()) {
          faseAtual = 'confirmando_final'
          await dormir(PP_POLL_MS)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_final') {
        if (automation.ehTelaDePdf()) {
          faseAtual = 'baixando_pdf'
          continue
        }
        if (automation.clicarConfirmarGenerico()) {
          await dormir(PP_POLL_MS)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'baixando_pdf') {
        ppLog('Baixando PDF da fatura...')
        const pdfBase64 = await automation.baixarPdfComoBase64()
        await avisarBackground('pp:faturaPdfPronta', {
          linha: job.linha,
          chaveFatura: job._faturaAtualChave,
          pdfBase64,
        })
        return
      }
    } catch (err) {
      await avisarBackground('pp:erroPortal', { mensagem: `erro na fase "${faseAtual}": ${err.message}` })
      return
    }
  }
}

async function iniciar() {
  const job = await pegarJob()
  if (!job || !job.ativo) return
  ppLog('Job ativo, começando fluxo para', job.custcode)
  await rodarFluxo(job)
}

iniciar()
