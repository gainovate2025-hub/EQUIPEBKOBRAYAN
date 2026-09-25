// portal.js — Extensão Portal Parcelamento
// -----------------------------------------------------------------------
// Orquestra a automação nessa aba: espera o background.js deixar um
// "trabalho" (pp_job) no chrome.storage.session pra essa aba processar —
// busca o Custcode, escolhe a fatura, confirma, escolhe EMAIL como
// método de envio, cola o e-mail do destinatário, confirma de novo (isso
// já manda o e-mail — o Portal não tem PDF nem tela de "enviado com
// sucesso" separada), e avisa o background.js.
//
// MESMO PRINCÍPIO do Crivo/P2B: em vez de uma função só que clica e fica
// esperando (quebra se a tela atualizar no meio via AJAX da PrimeFaces),
// um laço curto olha o estado ATUAL da tela a cada rodada e decide o
// próximo passo.
//
// Quem tem mais de uma fatura em aberto: a extensão manda TODAS, uma de
// cada vez — depois de cada envio, recarrega essa aba no início (nunca
// usa "voltar" do navegador — apps JSF/PrimeFaces quebram fácil com
// isso) e o job continua com a MESMA lista de faturas já enviadas
// (pp_job.faturasProcessadas), pra pular as que já foram e mandar só a
// próxima.
// -----------------------------------------------------------------------

const PP_POLL_MS = 1000
const PP_TIMEOUT_MS = 70000

const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

function ppLog(...args) {
  console.log('[PortalParcelamento]', ...args)
  const texto = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  try {
    chrome.storage.session.get('pp_job').then(({ pp_job: j }) => {
      chrome.runtime.sendMessage({ tipo: 'pp:log', custcode: j?.custcode, mensagem: texto }).catch(() => {})
    }).catch(() => {})
  } catch {
    // extensão foi recarregada com essa aba aberta — dê F5 na aba
  }
}

const MODOS = ['colar', 'teclas', 'inserir']

async function modoInicial(job) {
  if (typeof job.modoIdx === 'number') return job.modoIdx
  const { pp_modo_ok: ok } = await chrome.storage.local.get('pp_modo_ok')
  const i = MODOS.indexOf(ok)
  return i >= 0 ? i : 1 // começa por 'teclas' (o mais parecido com pessoa)
}

async function lembrarModo(modo) {
  if (MODOS.includes(modo)) await chrome.storage.local.set({ pp_modo_ok: modo })
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function estaLigado() {
  const { pp_ligado: ligado } = await chrome.storage.local.get('pp_ligado')
  return Boolean(ligado)
}

async function pegarJob() {
  const { pp_job: job } = await chrome.storage.session.get('pp_job')
  return job || null
}

// Busca o login mais recente que alguém colou no site (Automações >
// Portal Parcelamento). Ignora se estiver velho demais — o token do RSA
// muda a cada minuto.
async function pegarLoginPendente() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/parcelamento_login?id=eq.1&select=usuario,token,criado_em`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    })
    if (!res.ok) return null
    const [linha] = await res.json()
    if (!linha?.usuario || !linha?.token) return null
    const idadeMs = Date.now() - new Date(linha.criado_em).getTime()
    if (idadeMs > PORTAL_SELECTORS.loginMaxIdadeMs) return null
    return linha
  } catch (err) {
    ppLog('Falha ao buscar login pendente:', err.message)
    return null
  }
}

// Evita reenviar o MESMO login em loop se a tela não navegar pra lugar
// nenhum — só tenta um "criado_em" UMA VEZ por etapa.
async function jaTentado(chave, criadoEm) {
  const resultado = await chrome.storage.session.get(chave)
  return resultado[chave] === criadoEm
}

async function marcarTentado(chave, criadoEm) {
  await chrome.storage.session.set({ [chave]: criadoEm })
}

async function tentarResolverLogin(automation) {
  const etapaUsuario = automation.detectarTelaLoginUsuario()
  if (etapaUsuario) {
    const login = await pegarLoginPendente()
    if (!login) {
      ppLog('Tela de login (matrícula) — aguardando alguém colar o login no site.')
      return true
    }
    if (await jaTentado('pp_login_usuario_tentado_em', login.criado_em)) {
      ppLog('Já tentei essa matrícula nessa tela — aguardando um login novo.')
      return true
    }
    ppLog('Preenchendo matrícula e avançando:', login.usuario)
    await automation.preencherUsuarioEAvancar(etapaUsuario, login.usuario)
    await marcarTentado('pp_login_usuario_tentado_em', login.criado_em)
    return true
  }

  const etapaToken = automation.detectarTelaLoginToken()
  if (etapaToken) {
    const login = await pegarLoginPendente()
    if (!login) {
      ppLog('Tela de login (token) — aguardando alguém colar o login no site.')
      return true
    }
    if (await jaTentado('pp_login_token_tentado_em', login.criado_em)) {
      ppLog('Esse token já foi tentado — aguardando um login novo.')
      return true
    }
    ppLog('Preenchendo token e entrando.')
    await automation.preencherTokenEEntrar(etapaToken, login.token)
    await marcarTentado('pp_login_token_tentado_em', login.criado_em)
    return true
  }

  return false
}

async function avisarBackground(tipo, dados = {}) {
  try {
    await chrome.runtime.sendMessage({ tipo, ...dados })
  } catch (err) {
    ppLog('Falha ao avisar o background:', err.message)
  }
}

// A fase fica gravada no job: várias telas do Portal são páginas NOVAS
// (o content script recomeça do zero a cada uma). Sem isso, ao chegar na
// tela de selecionar fatura ele achava que ainda não tinha buscado e
// voltava pra tela do Custcode.
async function salvarFase(job, fase) {
  job.fase = fase
  const atual = await pegarJob()
  if (!atual) return
  await chrome.storage.session.set({ pp_job: { ...atual, fase, _faturaAtualChave: job._faturaAtualChave ?? atual._faturaAtualChave } })
}

async function rodarFluxo(job) {
  const automation = new PortalAutomation(PORTAL_SELECTORS, ppLog)
  const modoIni = await modoInicial(job)
  let modoUsado = null
  let faseAtual = job.fase || 'busca'
  let faseSalva = faseAtual
  if (faseAtual !== 'busca') ppLog('Retomando na fase salva:', faseAtual)
  let jaBuscou = faseAtual !== 'busca'
  let jaTentouNavegarBusca = false
  let cliquesBuscar = 0
  let ultimoCliqueBuscar = 0
  let inicioFase = Date.now()

  while (true) {
    // Desligou na extensão: o background apaga o job e/ou pp_ligado vira
    // false — pára aqui, sem clicar mais nada.
    if (!(await estaLigado()) || !(await pegarJob())) {
      ppLog('Extensão desligada — parando o fluxo nessa aba.')
      return
    }
    if (faseAtual !== faseSalva) {
      faseSalva = faseAtual
      await salvarFase(job, faseAtual)
    }
    if (Date.now() - inicioFase > PP_TIMEOUT_MS) {
      // Se travou DEPOIS de clicar no Confirmar final, o e-mail pode ter
      // sido enviado mesmo assim — não repete (evita mandar 2x).
      await avisarBackground('pp:erroPortal', {
        mensagem: `travou na fase "${faseAtual}" — url: ${location.href}`,
        naoRepetir: faseAtual === 'aguardando_confirmacao_envio',
      })
      return
    }

    try {
      // Cada clique em Confirmar troca de página: se retomou numa fase que
      // já ficou pra trás, pula direto pra fase que a tela mostra.
      if (['confirmando_fatura', 'metodo_envio', 'preenchendo_email'].includes(faseAtual)) {
        if (automation.pareceEmailEnviado()) faseAtual = 'aguardando_confirmacao_envio'
        else if (automation.detectarTelaConfirmacaoFinal()) faseAtual = 'confirmando_final'
        if (faseAtual !== faseSalva) continue
      }
      if (faseAtual === 'busca') {
        const telaContexto = automation.detectarTelaContexto()
        if (telaContexto) {
          ppLog('Tela de contexto (TIM/INTELIG) — selecionando TIM.')
          automation.selecionarContextoTim()
          await pausaHumana(500, 1100)
          await automation.cliqueHumano(telaContexto.botao)
          await dormir(PP_POLL_MS)
          continue
        }

        const telaBusca = automation.detectarTelaBusca()
        if (telaBusca && !jaBuscou) {
          ppLog('Preenchendo Custcode e buscando:', JSON.stringify(job.custcode))
          const resultado = await automation.preencherEBuscar(job.custcode, modoIni, () => salvarFase(job, 'aguardando_resultado_busca'))
          if (!resultado.ok) {
            await avisarBackground('pp:erroPortal', {
              mensagem: `CUST CODE NÃO ENCONTRADO — não consegui colar direito, ficou "${resultado.valorFinal}".`,
            })
            return
          }
          jaBuscou = true
          modoUsado = resultado.modo
          cliquesBuscar = 1
          faseAtual = 'aguardando_resultado_busca'
          faseSalva = faseAtual
          await salvarFase(job, faseAtual)
          ultimoCliqueBuscar = Date.now()
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }
        if (!telaBusca && !jaBuscou) {
          if (!jaTentouNavegarBusca) {
            jaTentouNavegarBusca = true
            const atual = await pegarJob()
            const navegadas = atual?.navBusca || 0
            const naAppDoPortal = location.hostname.includes('portalparcelamento') && location.pathname.includes('appSgr')
            const paginaDeErro = /sessionexpired|login|erro|error/i.test(location.pathname)
            ppLog('Sem campo de busca nem de contexto — url:', location.href, '| já naveguei:', navegadas)
            // Limite de 2 idas pra tela de busca por cliente: sem isso, se a
            // tela de destino também não tiver o campo (sessão caída, outro
            // navegador sem login), a página recarrega sem parar.
            if (naAppDoPortal && !paginaDeErro && navegadas < 2) {
              await chrome.storage.session.set({ pp_job: { ...atual, navBusca: navegadas + 1 } })
              location.href = PORTAL_SELECTORS.urlTelaBusca
              return
            }
            ppLog('Não vou navegar de novo — aguardando a tela certa (faça o login no Portal se estiver deslogado).')
          }
          await dormir(PP_POLL_MS)
          continue
        }
        faseAtual = 'aguardando_resultado_busca'
        inicioFase = Date.now()
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'aguardando_resultado_busca') {
        if (automation.pareceErroValidacao()) {
          await avisarBackground('pp:erroPortal', {
            mensagem: `CUST CODE NÃO ENCONTRADO — Portal recusou "${job.custcode}" como inválido.`,
            trocarModo: true,
            modoUsado,
          })
          return
        }

        if (automation.pareceSemFatura()) {
          await lembrarModo(modoUsado)
          if (job.faturasProcessadas.length > 0) {
            await avisarBackground('pp:clienteConcluido', { linha: job.linha })
          } else {
            ppLog('Sem fatura em aberto para', job.custcode)
            await avisarBackground('pp:semFatura', { linha: job.linha })
          }
          return
        }

        const proxima = automation.proximaFaturaNaoProcessada(job.faturasProcessadas)
        if (proxima) {
          await lembrarModo(modoUsado)
          await pausaHumana(600, 1400)
          ppLog('Selecionando fatura:', proxima.chave.slice(0, 60))
          const marcou = await automation.selecionarFatura(proxima)
          if (!marcou) {
            await avisarBackground('pp:erroPortal', { mensagem: 'Cliquei na bolinha da fatura mas ela não marcou.' })
            return
          }
          job._faturaAtualChave = proxima.chave
          faseAtual = 'confirmando_fatura'
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }

        // O botão Buscar do Portal às vezes "engole" o clique: se passou
        // 20 segundos e a tela continua igual (sem fatura, sem erro,
        // sem "sem fatura"), clica de novo — até 3 cliques no total.
        const aindaNaBusca = automation.detectarTelaBusca()
        if (aindaNaBusca && aindaNaBusca.campo.value && cliquesBuscar < 3 && Date.now() - ultimoCliqueBuscar > 20000) {
          cliquesBuscar += 1
          ppLog(`Tela não mudou depois do Buscar — clicando de novo (clique ${cliquesBuscar}).`)
          await pausaHumana(500, 1100)
          await automation.cliqueHumano(aindaNaBusca.botao)
          ultimoCliqueBuscar = Date.now()
        }

        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_fatura') {
        await pausaHumana(500, 1200)
        ppLog('Procurando botão Confirmar da fatura…')
        if (await automation.clicarConfirmarFatura()) {
          ppLog('Cliquei em Confirmar da fatura.')
          faseAtual = 'metodo_envio'
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'metodo_envio') {
        if (!automation.detectarTelaMetodoEnvio()) {
          await dormir(PP_POLL_MS)
          continue
        }
        const marcouEmail = await automation.selecionarEmail()
        if (!marcouEmail) {
          await avisarBackground('pp:erroPortal', { mensagem: 'Não consegui marcar a opção EMAIL como método de envio.' })
          return
        }
        faseAtual = 'preenchendo_email'
        inicioFase = Date.now()
        await dormir(500)
        continue
      }

      if (faseAtual === 'preenchendo_email') {
        const campo = automation.campoDestinatarios()
        if (!campo) {
          await dormir(PP_POLL_MS)
          continue
        }
        const resultado = await automation.preencherEmailDestinatario(job.email, modoIni)
        if (!resultado.ok) {
          await avisarBackground('pp:erroPortal', {
            mensagem: `Não consegui colar o e-mail direito — ficou "${resultado.valorFinal}".`,
          })
          return
        }
        await pausaHumana(700, 1400)
        await salvarFase(job, 'confirmando_final')
        if (!(await automation.clicarConfirmarGenerico())) {
          await avisarBackground('pp:erroPortal', { mensagem: 'Preenchi o e-mail mas não achei o botão Confirmar.' })
          return
        }
        faseAtual = 'confirmando_final'
        inicioFase = Date.now()
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_final') {
        if (!automation.detectarTelaConfirmacaoFinal()) {
          await dormir(PP_POLL_MS)
          continue
        }
        ppLog('Tela de conferência final (Destino do Email) — confirmando o envio.')
        await pausaHumana(900, 1800)
        await salvarFase(job, 'aguardando_confirmacao_envio')
        if (!(await automation.clicarConfirmarGenerico())) {
          await avisarBackground('pp:erroPortal', { mensagem: 'Cheguei na tela final mas não achei o botão Confirmar.' })
          return
        }
        faseAtual = 'aguardando_confirmacao_envio'
        inicioFase = Date.now()
        await dormir(PP_POLL_MS)
        continue
      }

      // Só marca como enviado depois de ver a mensagem de verdade
      // ("Sucesso! E-mail enviado com sucesso!") — não basta o clique em
      // Confirmar ter "funcionado" sem erro aparente.
      if (faseAtual === 'aguardando_confirmacao_envio') {
        if (!automation.pareceEmailEnviado()) {
          await dormir(PP_POLL_MS)
          continue
        }
        ppLog('Confirmado: "E-mail enviado com sucesso!"')
        await automation.clicarFechar()
        await avisarBackground('pp:emailEnviado', { linha: job.linha, chaveFatura: job._faturaAtualChave })
        return
      }
    } catch (err) {
      await avisarBackground('pp:erroPortal', { mensagem: `erro na fase "${faseAtual}": ${err.message}` })
      return
    }
  }
}

async function iniciar() {
  const automation = new PortalAutomation(PORTAL_SELECTORS, ppLog)

  while (await tentarResolverLogin(automation)) {
    await dormir(PP_POLL_MS)
  }

  if (!(await estaLigado())) return
  const job = await pegarJob()
  if (!job || !job.ativo) return
  ppLog('Job ativo, começando fluxo para', job.custcode)
  await rodarFluxo(job)
}

if (!window.__ppIniciado) {
  window.__ppIniciado = true
  iniciar()
}
