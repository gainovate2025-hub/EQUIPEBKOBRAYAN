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

// Deixado bem devagar de propósito enquanto ainda tamos ajustando os
// seletores da lista de fatura (nunca vistos ao vivo) — dá tempo de ver
// e printar cada tela antes do passo seguinte. Depois que tudo isso
// estiver certo, pode voltar a acelerar.
const PP_POLL_MS = 15000
const PP_TIMEOUT_MS = 120000

// Os passos depois da busca (selecionar fatura, impressão online,
// confirmar, baixar PDF) usam seletores nunca vistos ao vivo — em vez de
// continuar adivinhando e testando às cegas, PARA logo depois de buscar
// com sucesso e deixa a aba parada na tela de resultado, esperando
// alguém olhar e dizer o que ajustar. Muda pra false só depois que os
// seletores dessas telas estiverem confirmados.
const PARAR_APOS_BUSCAR = true

// Mesmo projeto Supabase do resto do painel-bko — veja migration_025 pro
// motivo de existir uma tabela pra isso (login em 2 etapas com token de
// hardware, não dá pra guardar senha fixa).
const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

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

// Busca o login mais recente que alguém colou no site (Automações >
// Portal Parcelamento). Ignora se estiver velho demais — o token do RSA
// muda a cada minuto, não adianta tentar entrar com um vencido.
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
// nenhum (matrícula errada, token digitado errado, ou até só uma
// mensagem de erro que não recarrega a página) — só tenta um "criado_em"
// UMA VEZ por etapa (usuário e token contam separado, já que são ações
// diferentes dentro do MESMO login), e fica esperando um login novo
// depois disso. Sem isso a extensão ficava clicando dezenas de vezes
// seguidas na mesma tela (visto ao vivo: 40+ tentativas em segundos).
async function jaTentado(chave, criadoEm) {
  const resultado = await chrome.storage.session.get(chave)
  return resultado[chave] === criadoEm
}

async function marcarTentado(chave, criadoEm) {
  await chrome.storage.session.set({ [chave]: criadoEm })
}

// Chamado a cada carregamento da aba (antes de qualquer outra coisa) —
// se a tela for de login, tenta resolver com o que tiver pendente no
// Supabase. Devolve true quando agiu nessa tela (a página vai navegar
// em seguida, então não faz sentido continuar o resto da função nesse
// carregamento).
async function tentarResolverLogin(automation) {
  const etapaUsuario = automation.detectarTelaLoginUsuario()
  if (etapaUsuario) {
    const login = await pegarLoginPendente()
    if (!login) {
      ppLog('Tela de login (matrícula) — aguardando alguém colar o login no site (Automações > Portal Parcelamento).')
      return true
    }
    if (await jaTentado('pp_login_usuario_tentado_em', login.criado_em)) {
      ppLog('Já tentei essa matrícula nessa tela — aguardando um login novo.')
      return true
    }
    ppLog('Preenchendo matrícula e avançando:', login.usuario, '| criado_em:', login.criado_em)
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
    ppLog('Preenchendo token e entrando. | criado_em:', login.criado_em)
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

async function rodarFluxo(job) {
  const automation = new PortalAutomation(PORTAL_SELECTORS)
  const inicio = Date.now()
  let faseAtual = 'busca'
  let jaBuscou = false
  let jaTentouNavegarBusca = false
  let inicioFase = inicio
  let tentativasClickBuscar = 1
  let esperasSemMudanca = 0

  while (true) {
    if (Date.now() - inicioFase > PP_TIMEOUT_MS && faseAtual !== 'aguardando_pdf_lento') {
      await avisarBackground('pp:erroPortal', { mensagem: `travou na fase "${faseAtual}" — url: ${location.href}` })
      return
    }

    try {
      if (faseAtual === 'busca') {
        // pode aparecer uma tela "Selecione o Contexto" (TIM/INTELIG)
        // antes da busca — resolve isso primeiro, sem contar como erro.
        const telaContexto = automation.detectarTelaContexto()
        if (telaContexto) {
          ppLog('Tela de contexto (TIM/INTELIG) — selecionando TIM.')
          automation.selecionarContextoTim()
          await dormir(300)
          telaContexto.botao.click()
          await dormir(PP_POLL_MS)
          continue
        }

        const telaBusca = automation.detectarTelaBusca()
        if (telaBusca && !jaBuscou) {
          ppLog('Preenchendo Custcode e buscando:', JSON.stringify(job.custcode))
          const resultado = await automation.preencherEBuscar(job.custcode)
          if (!resultado.ok) {
            await avisarBackground('pp:erroPortal', {
              mensagem: `Não consegui digitar o Custcode direito — ficou "${resultado.valorFinal}".`,
            })
            return
          }
          jaBuscou = true
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }
        if (!telaBusca && !jaBuscou) {
          // Nem tela de contexto, nem tela de busca — pode ser a tela
          // "Home" (Seja bem-vindo) ou outra transição no meio do
          // caminho. Só navega direto pra tela de busca UMA vez (senão
          // fica em loop de navegação se a URL fixa também não carregar
          // certo) — as próximas rodadas só esperam a página carregar.
          if (!jaTentouNavegarBusca) {
            ppLog('Tela sem campo de busca nem de contexto — indo direto pra tela de busca. url:', location.href)
            jaTentouNavegarBusca = true
            location.href = PORTAL_SELECTORS.urlTelaBusca
            return // a página vai navegar — o content script recarrega sozinho
          }
          await dormir(PP_POLL_MS)
          continue
        }
        faseAtual = 'aguardando_resultado_busca'
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'aguardando_resultado_busca') {
        if (automation.pareceErroValidacao()) {
          await avisarBackground('pp:erroPortal', {
            mensagem: `Custcode "${job.custcode}" recusado como inválido pelo Portal — provavelmente o clique em Buscar disparou cedo demais.`,
          })
          return
        }

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

        if (PARAR_APOS_BUSCAR) {
          ppLog('PARAR_APOS_BUSCAR ligado — busca deu certo, parando aqui de propósito. Olha a tela e me diz o que tem.')
          return
        }

        const proxima = automation.proximaFaturaNaoProcessada(job.faturasProcessadas)
        if (proxima) {
          ppLog('Selecionando fatura:', proxima.chave.slice(0, 60))
          automation.selecionarFatura(proxima)
          job._faturaAtualChave = proxima.chave
          faseAtual = 'confirmando_fatura'
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }

        // nem "sem fatura" nem lista de fatura visível ainda — pode estar
        // no meio do AJAX de busca, OU os seletores da lista de fatura
        // ainda não reconhecem a tela de resultado (são "melhor esforço",
        // nunca vistos ao vivo). IMPORTANTE: desligado o reforço de
        // "clicar Buscar de novo se não mudar" que tinha aqui — ele
        // disparava bem na tela de resultado (achando que "não mudou
        // nada" por não reconhecer a lista) e reiniciava a busca do zero
        // antes de dar tempo de ver o que tinha na tela.
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_fatura') {
        if (automation.clicarConfirmarFatura()) {
          faseAtual = 'impressao_online'
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'impressao_online') {
        if (automation.selecionarImpressaoOnline()) {
          faseAtual = 'confirmando_impressao'
          inicioFase = Date.now()
          await dormir(300)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_impressao') {
        if (automation.clicarConfirmarGenerico()) {
          faseAtual = 'confirmando_final'
          inicioFase = Date.now()
          await dormir(PP_POLL_MS)
          continue
        }
        await dormir(PP_POLL_MS)
        continue
      }

      if (faseAtual === 'confirmando_final') {
        if (automation.ehTelaDePdf()) {
          faseAtual = 'baixando_pdf'
          inicioFase = Date.now()
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
  const automation = new PortalAutomation(PORTAL_SELECTORS)

  // Fica checando em loop enquanto a tela continuar sendo de login — se o
  // RSA recusar o token, a tela de erro normalmente NÃO recarrega a
  // página (fica exatamente igual, só com uma mensagem de erro), então
  // checar só uma vez faria a extensão nunca mais notar um login novo
  // mandado depois. Se a tela realmente navegar pra outro lugar (login
  // deu certo), o content script inteiro morre aqui e um novo começa do
  // zero na próxima página — não precisa sair do loop na mão.
  while (await tentarResolverLogin(automation)) {
    await dormir(PP_POLL_MS)
  }

  const job = await pegarJob()
  if (!job || !job.ativo) return
  ppLog('Job ativo, começando fluxo para', job.custcode)
  await rodarFluxo(job)
}

iniciar()
