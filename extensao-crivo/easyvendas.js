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

// 1.6.4: nome da negociação que o 2º sistema abre pra se religar quando
// trava (Crivo > Negociação pra religar o 2º sistema, no painel).
let nomeNegociacao = null
async function atualizarNomeNegociacao() {
  try {
    const linhas = await supaFetch('crivo_configuracoes?select=negociacao_nome&id=eq.1&limit=1')
    const bruto = (linhas?.[0]?.negociacao_nome || '').trim()
    // 1.6.5: um nome pra cada PC, guardado como {"1":"...","2":"...","3":"..."}.
    // Texto simples (formato da 1.6.4) vale pra todos os PCs.
    let nome = bruto
    try {
      const obj = JSON.parse(bruto)
      if (obj && typeof obj === 'object') nome = obj[NUMERO_PC] || ''
    } catch { /* texto simples */ }
    nomeNegociacao = String(nome || '').trim() || null
  } catch {
    // coluna ainda não criada ou falha de rede: segue sem o nome
  }
}

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
const TIMEOUT_DADOS_S2_MS = 12000
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

// 1.6.2 (15/11/2026, pedido do Brayan): página limpa a cada CNPJ.
// Quando um CNPJ vinha logo depois do outro, a mensagem do anterior podia
// continuar na tela (ou a tela travar) e ser lida como resposta do novo.
// Agora a aba do 1º sistema SEMPRE recarrega antes de cada leitura (o 2º
// sistema não pode recarregar, veja 1.6.3) e volta pro endereço da tela inicial do sistema (guardado na 1ª vez que a
// aba achou o formulário), mesmo se tiver parado em outra tela.
const CHAVE_URL_INICIO = 'crivo_url_inicio'
const CARREGOU_EM = Date.now()

function guardarUrlInicio(numeroSistema) {
  if (detectarSistemaPelaUrl() === numeroSistema) sessionStorage.setItem(CHAVE_URL_INICIO, location.href)
}

function recarregarLimpo() {
  const inicio = sessionStorage.getItem(CHAVE_URL_INICIO)
  if (inicio && inicio !== location.href) {
    try { history.replaceState(history.state, '', inicio) } catch { /* segue com o reload normal */ }
  }
  location.reload()
}

// 1.6.4 (15/11/2026, pedido do Brayan): religa o 2º sistema quando ele
// trava ou cai na tela de termos, do jeito que a equipe faz na mão:
//   1. clica em "Negociações" no menu;
//   2. digita o nome configurado no painel no campo "Razão Social";
//   3. clica na negociação com esse nome;
//   4. clica em EDITAR e espera a tela da 1ª venda com o campo CNPJ.
// Se qualquer passo falhar (ou não tiver nome configurado), recarrega a
// página. Devolve true quando voltou pro formulário.
function visivel(el) {
  return Boolean(el && (el.offsetParent || el.getClientRects().length))
}

async function esperarAte(achar, ms) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const achado = achar()
    if (achado) return achado
    await dormir(300)
  }
  return null
}

function acharPorTexto(alvo, { exato = false, ignorar = null } = {}) {
  const t = semAcento(alvo).trim()
  let melhor = null
  for (const el of document.querySelectorAll('a, button, [role="button"], [ng-click], [ui-sref], md-list-item, li, tr, td, span, div, p, h1, h2, h3, h4')) {
    if (el === ignorar || !visivel(el)) continue
    const texto = semAcento(el.innerText || '').trim()
    if (!texto || (exato ? texto !== t : !texto.includes(t))) continue
    if (!melhor || texto.length < melhor.texto.length) melhor = { el, texto }
  }
  if (!melhor) return null
  return melhor.el.closest('a, button, [role="button"], [ng-click], [ui-sref], md-list-item, tr') || melhor.el
}

function acharInputPorRotulo(rotulo) {
  const t = semAcento(rotulo)
  for (const input of document.querySelectorAll('input')) {
    if (!visivel(input) || input.type === 'hidden') continue
    const attrs = semAcento([input.placeholder, input.getAttribute('aria-label'), input.name, input.id].filter(Boolean).join(' '))
    if (attrs.includes(t) || attrs.includes(t.replace(/\s/g, ''))) return input
    let c = input.parentElement
    for (let n = 0; c && n < 3; n++, c = c.parentElement) {
      const label = c.querySelector('label')
      if (label && semAcento(label.textContent).includes(t)) return input
    }
  }
  return null
}

async function digitarTexto(input, texto) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  input.focus()
  setter.call(input, '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  let atual = ''
  for (const ch of texto) {
    atual += ch
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
    setter.call(input, atual)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }))
    await pausaHumana(40, 90)
  }
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

// 1.6.7 (16/11/2026, Brayan): erro "O estado do endereço informado não
// pode ser diferente do estado de cadastro do CNPJ". Acontece com empresa
// de outro estado. Nesses casos o Crivo usa o CEP da própria empresa:
//   - erro só no 2º sistema: coloca o CEP da empresa só no 2º e avança de novo;
//   - erro já no 1º sistema: refaz o 1º com o CEP da empresa (e o 2º, se
//     der o mesmo erro, também troca sozinho).
// Uma tentativa por CNPJ; se o erro continuar, segue a regra de sempre.
const PADRAO_ERRO_ESTADO = /estado do endereco[\s\S]{0,80}diferente/
function ehErroDeEstado(texto) {
  return PADRAO_ERRO_ESTADO.test(semAcento(texto || ''))
}
function precisaEnderecoDaEmpresa(texto) {
  const t = semAcento(texto || '')
  if (/telefone invalido|razao social e obrigatori/.test(t)) return false // 1.7.9: tela em branco é religar, não CEP
  return PADRAO_ERRO_ESTADO.test(t) || /formulario com pend|favor rever o preenchimento|e obrigatori/.test(t)
}
function chaveCepEmpresa(consultaId) {
  return `crivo_cep_empresa_${consultaId}`
}

async function buscarCepDaEmpresa(cnpj, consultaId, numeroSistema, { comUf = false } = {}) {
  let resp = null
  try {
    resp = await chrome.runtime.sendMessage({ tipo: 'crivo:cepEmpresa', cnpj })
  } catch (err) {
    resp = { erro: err.message }
  }
  // 1.7.7: se a extensão foi atualizada e esta aba não foi recarregada,
  // o fundo da extensão não responde ("Extension context invalidated").
  // Aí busca direto na BrasilAPI daqui da página (ela aceita).
  if (!String(resp?.cep || '').replace(/\D/g, '')) {
    if (/context invalidated/i.test(resp?.erro || '')) {
      logErro(numeroSistema, consultaId, 'A extensão foi atualizada e esta aba não foi recarregada (F5). Buscando o CEP direto, mas recarregue esta aba quando puder.')
    }
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${String(cnpj).replace(/\D/g, '')}`)
      if (res.ok) {
        const d = await res.json()
        const tipo = String(d.descricao_tipo_de_logradouro || '').trim()
        resp = {
          cep: d.cep, uf: d.uf,
          rua: [tipo, d.logradouro].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
          numero: d.numero, bairro: d.bairro, complemento: d.complemento, cidade: d.municipio,
        }
      }
    } catch { /* segue sem CEP */ }
  }
  const cep = String(resp?.cep || '').replace(/\D/g, '')
  if (cep.length === 8) {
    log(numeroSistema, consultaId, `CEP da empresa na Receita: ${cep} (${resp.uf || '?'})`)
    const formatado = cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')
    return comUf ? { ...resp, cep: formatado, uf: String(resp.uf || '').toUpperCase() } : formatado
  }
  logErro(numeroSistema, consultaId, `Erro de estado: não consegui o CEP da empresa (${resp?.erro || 'sem CEP na Receita'})`)
  return null
}

function camposDeCepVisiveis() {
  const lista = [...document.querySelectorAll('input')].filter((input) => {
    if (!visivel(input) || input.type === 'hidden' || input.disabled) return false
    const attrs = semAcento([input.name, input.id, input.placeholder, input.getAttribute('aria-label'), input.getAttribute('ng-model')].filter(Boolean).join(' '))
    if (/\bcep\b|\.cep\b/.test(attrs)) return true
    const label = input.parentElement?.querySelector('label')
    return Boolean(label && /^cep\b/.test(semAcento(label.textContent).trim()))
  })
  return [...new Set(lista)]
}

// 1.7.4 (Brayan): depois de trocar o CEP, preenche o endereço da empresa
// (buscado pelo CNPJ) nos campos da Empresa que estiverem vazios ou
// inválidos. CEP geral da cidade não traz rua/bairro e a tela travava em
// "CEP | Complemento" inválidos.
async function preencherEnderecoDaEmpresa(consultaId, empresa) {
  const valores = [
    ['Endereço', empresa.rua],
    ['Número', empresa.numero || 'SN'],
    ['Bairro', empresa.bairro],
    ['Complemento', empresa.complemento || 'SN'],
  ]
  const feitos = []
  for (const [rotulo, valor] of valores) {
    if (!valor) continue
    const campo = acharInputPorRotulo(rotulo)
    if (!campo || campo.disabled || campo.readOnly) continue
    const invalido = campo.matches('.ng-invalid, [aria-invalid="true"]')
    if (campo.value.trim() && !invalido && rotulo !== 'Endereço' && rotulo !== 'Bairro') continue
    await digitarTexto(campo, String(valor).toUpperCase())
    campo.dispatchEvent(new Event('blur', { bubbles: true }))
    feitos.push(`${rotulo}: ${String(valor).toUpperCase()}`)
    await pausaHumana(200, 400)
  }
  log(2, consultaId, feitos.length ? `Endereço da empresa preenchido — ${feitos.join(' | ')}` : 'Endereço da empresa: nenhum campo pra preencher (vazio na Receita ou travado na tela)')
}

async function trocarCepNoSegundoSistema(automation, consultaId, cep, empresa = null) {
  automation.fecharModal()
  await dormir(600)
  // 1.6.9: só o CEP da Empresa (o 1º da tela). Os de sócios ficam como estão.
  const campos = camposDeCepVisiveis().slice(0, 1)
  if (!campos.length) {
    logErro(2, consultaId, 'Erro de estado: não achei campo de CEP na tela do 2º sistema')
    return false
  }
  // 1.7.5: guarda o CEP que a negociação tinha, pra devolver antes do
  // próximo CNPJ (senão a tela ficava com CEP/Complemento marcados e
  // travava os CNPJs seguintes).
  if (!sessionStorage.getItem('crivo_cep_original_s2') && campos[0].value) {
    sessionStorage.setItem('crivo_cep_original_s2', campos[0].value)
  }
  log(2, consultaId, `Erro de estado: colocando o CEP da empresa (${cep}) em ${campos.length} campo(s) de CEP do 2º sistema`)
  for (const campo of campos) {
    await digitarTexto(campo, cep)
    campo.dispatchEvent(new Event('blur', { bubbles: true }))
    const lupa = automation.acharBotaoBuscarCep(campo)
    if (lupa) {
      await pausaHumana(300, 600)
      lupa.click()
    }
    await dormir(1500)
  }
  if (empresa) await preencherEnderecoDaEmpresa(consultaId, empresa)
  return true
}

function naTelaDeNegociacoes() {
  return location.href.includes('/negociacao') && !location.href.includes('/primeiravenda')
}

// 1.6.9: só clica em link de verdade pra lista de Negociações (href,
// ui-sref ou ng-click que fala de negociação), nunca em texto solto. Na
// 1.6.8 o "Negociações" achado era só um título: o clique não fazia nada e
// os cliques em Cliente/menu bagunçavam o formulário da 1ª venda.
function linksDeNegociacoes() {
  const seletor = 'a, button, [role="button"], [ui-sref], [ng-click], [href], md-list-item, li'
  return [...document.querySelectorAll(seletor)].filter((el) => {
    if (el.id === 'negociacaoButton') return false
    const attrs = semAcento([el.getAttribute('href'), el.getAttribute('ui-sref'), el.getAttribute('ng-click')].filter(Boolean).join(' '))
    if (/primeiravenda|novanegociacao|renegociacao/.test(attrs)) return false
    const texto = semAcento(el.innerText || el.textContent || '').trim()
    return /negociac/.test(attrs) || texto === 'negociacoes'
  })
}

function descreverLinksDeNegociacoes() {
  return linksDeNegociacoes().slice(0, 6).map((el) =>
    `<${el.tagName.toLowerCase()} ${['href', 'ui-sref', 'ng-click'].map((a) => el.getAttribute(a) ? `${a}="${el.getAttribute(a)}"` : '').filter(Boolean).join(' ')}>${(el.innerText || '').trim().slice(0, 30)}`
  ).join(' | ') || '(nenhum)'
}

async function irParaNegociacoes(automation, consultaId) {
  // 1º: link de Negociações que já esteja na tela (menu aberto ou atalho)
  const candidatos = linksDeNegociacoes().sort((a, b) => (visivel(b) ? 1 : 0) - (visivel(a) ? 1 : 0))
  for (const el of candidatos.slice(0, 3)) {
    // 1.7.3: no menu da esquerda (Clientes / Negociações / Pedidos) o
    // clique vale no botão de dentro do item, não no item.
    // 1.7.9: tenta o botão de dentro e o próprio item; se nada abrir,
    // abre o menu (☰) e tenta de novo (às vezes o menu está fechado).
    const alvos = [el.querySelector('button, a, [ng-click], [ui-sref]'), el].filter(Boolean)
    for (const alvo of alvos) {
      alvo.click()
      if (await esperarAte(() => naTelaDeNegociacoes() || null, 2500)) {
        log(2, consultaId, 'Religar: abri Negociações pelo link do menu')
        return true
      }
    }
  }
  const menu = automation.acharBotaoPorTexto(['menu'])
  if (menu) {
    menu.click()
    await dormir(900)
    for (const el of linksDeNegociacoes().filter(visivel).slice(0, 2)) {
      ;(el.querySelector('button, a, [ng-click], [ui-sref]') || el).click()
      if (await esperarAte(() => naTelaDeNegociacoes() || null, 2500)) {
        log(2, consultaId, 'Religar: abri o menu e cliquei em Negociações')
        return true
      }
    }
  }
  // 1.7.1: tirado o atalho pelo endereço (#!/master/negociacao): no teste
  // ele deixou a aba numa tela sem nada, só com "Entrar".
  logErro(2, consultaId, `Religar: não achei como abrir Negociações. Links vistos: ${descreverLinksDeNegociacoes()}`)
  return false
}

function telaDeLogin() {
  return !document.querySelector('input[name="cnpj"]') && /^entrar$/.test(semAcento(acharPorTexto('Entrar', { exato: true })?.innerText || '').trim())
}

async function religarSegundoSistema(automation, consultaId) {
  // 1.7.1: Easy Vendas pediu login (sessão da matrícula caiu): não mexe em
  // nada, só avisa. Alguém precisa entrar de novo nessa aba.
  if (telaDeLogin()) {
    logErro(2, consultaId, 'O Easy Vendas pediu login nesta aba (a sessão caiu). Entre de novo na matrícula e volte pra tela da 1ª venda.')
    return false
  }
  const falhou = async (passo) => {
    // 1.6.9 (Brayan): o 2º sistema nunca recarrega a página.
    logErro(2, consultaId, `Religar o 2º sistema falhou (${passo}). Tela: ${location.href.replace(/^.*#!/, '')}`)
    return false
  }
  if (!nomeNegociacao) return falhou(`nenhum nome de negociação configurado no painel pro PC ${NUMERO_PC}`)
  log(2, consultaId, `Religando o 2º sistema pela negociação "${nomeNegociacao}"`)
  automation.fecharModal()

  // 1.6.6: Cliente e depois Negociações. 1.6.8: só segue quando a tela
  // de Negociações abriu de verdade (antes digitava o nome na busca de
  // Clientes). Se "Negociações" não aparecer depois de Cliente, abre o
  // menu (☰) e tenta de novo.
  if (!(await irParaNegociacoes(automation, consultaId))) {
    return falhou('não consegui abrir Negociações')
  }

  // espera sair da tela da 1ª venda e aparecer o campo Razão Social da busca
  const campo = await esperarAte(() => (naTelaDeNegociacoes() ? acharInputPorRotulo('Razão Social') : null), 6000)
  if (!campo) return falhou('não achei o campo "Razão Social" em Negociações')
  await pausaHumana(300, 600)
  await digitarTexto(campo, nomeNegociacao)
  campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }))
  campo.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }))
  const lupa = automation.acharBotaoPertoDe(campo, EASYVENDAS_SELECTORS.botaoBuscarTextos)
  if (lupa) lupa.click()

  // 1.8.1: clica na opção com o nome (ex: CRIVO BRAYAN) e espera o
  // EDITAR. Tenta o próprio item e, se nada acontecer, a linha em volta
  // dele. Ignora a etiqueta da busca e o campo onde o nome foi digitado.
  const alvoNome = semAcento(nomeNegociacao).trim()
  const opcoes = () => [...document.querySelectorAll('button, tr, md-list-item, li, [ng-click], a, td, span, div')].filter((el) => {
    if (!visivel(el) || el === campo || el.contains(campo)) return false
    if (el.closest('md-chips, md-chip, .md-chip, .md-chips')) return false
    const t = semAcento(el.innerText || '').trim()
    return t.includes(alvoNome) && t.length < alvoNome.length + 120
  }).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)
  await esperarAte(() => (opcoes().length ? true : null), 8000)
  const lista = opcoes()
  if (!lista.length) return falhou(`não achei a opção "${nomeNegociacao}" na lista`)
  let editar = null
  const urlLista = location.href
  for (const el of lista.slice(0, 4)) {
    const alvos = [el, el.closest('tr, md-list-item, li, [ng-click], button, a')].filter((x, k, arr) => x && arr.indexOf(x) === k)
    for (const alvo of alvos) {
      await pausaHumana(250, 500)
      alvo.click()
      editar = await esperarAte(() => automation.acharBotaoPorTexto(['editar']), 4000)
      if (editar || location.href !== urlLista) break
    }
    if (editar || location.href !== urlLista) break
  }
  log(2, consultaId, `Religar: cliquei na opção "${nomeNegociacao}"${editar ? ' e o EDITAR apareceu' : ''}`)
  if (!editar) editar = await esperarAte(() => automation.acharBotaoPorTexto(['editar']), 10000)
  if (!editar) return falhou('não achei o botão EDITAR')
  await pausaHumana(300, 600)
  editar.click()

  const voltou = await esperarAte(
    () => (location.href.includes('/primeiravenda') && automation.detectarEstado().tipo === 'formulario' ? true : null),
    8000
  )
  if (!voltou) return falhou('cliquei em EDITAR mas a tela da 1ª venda não voltou')
  log(2, consultaId, '2º sistema religado: de volta na tela da 1ª venda')
  await dormir(1000)
  return true
}

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
    // 1.6.2: no 1º sistema, sempre recarrega pra nenhuma mensagem da
    // tentativa anterior ficar na tela. 1.6.3: o 2º sistema NÃO pode
    // recarregar nunca (pedido do Brayan): lá só volta uma página.
    if (numeroSistema === 1) {
      await dormir(300)
      recarregarLimpo()
      return
    }
    // 1.6.4: o 2º sistema se religa pela negociação. 1.7.5: só quando o
    // formulário da 1ª venda sumiu da tela; se ele está lá, só fecha o
    // aviso e tenta de novo na hora (religar à toa gastava ~10s).
    automation.fecharModal()
    const emBranco = automation.camposInvalidosVisiveis().some((c) => /raz[aã]o social/i.test(c))
    if (automation.detectarEstado().tipo !== 'formulario' || emBranco) {
      await religarSegundoSistema(automation, consultaId)
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

  // 1.6.1: no 1º sistema, cada uma das 2 leituras começa com a página
  // recarregada. 1.6.3: o 2º sistema NÃO recarrega (pedido do Brayan,
  // 15/11/2026: lá a página não pode ser recarregada).
  // A marca no sessionStorage (sobrevive ao reload) evita recarregar em
  // loop: depois do reload o mesmo CNPJ volta pra esta aba e segue normal.
  const leitura = numeroSistema === 1 && consulta.sistema1_leitura1 ? 2 : 1
  const chaveRecarga = `crivo_recarregou_${consulta.id}_s${numeroSistema}_${leitura}`
  if (numeroSistema === 1 && !sessionStorage.getItem(chaveRecarga)) {
    sessionStorage.setItem(chaveRecarga, '1')
    log(numeroSistema, consulta.id, `Recarregando a página antes da ${leitura}ª leitura do CNPJ ${consulta.cnpj}`)
    await dormir(300)
    recarregarLimpo()
    return null
  }

  // Página acabou de carregar: dá um tempo pro site montar a tela toda
  // antes de mexer (senão pode pegar a tela ainda pela metade).
  const desdeQueCarregou = Date.now() - CARREGOU_EM
  if (desdeQueCarregou < 1500) await dormir(1500 - desdeQueCarregou)

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

  guardarUrlInicio(numeroSistema)

  const base = { consulta, iniciadoEm: Date.now(), reservaRenovadaEm: Date.now(), ultimoTextoNovo: '', estavel: 0 }

  // Usa o CEP da própria consulta quando tem um; senão cai pro CEP padrão
  // configurado no painel (Crivo > Configurações) — sem nenhum dos dois,
  // esse campo (obrigatório na tela) fica vazio e o Avançar/Solicitar
  // nunca funciona.
  const cepParaUsar = (numeroSistema === 1 && sessionStorage.getItem(chaveCepEmpresa(consulta.id))) || consulta.cep || cepPadrao
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
  const cepOriginal = sessionStorage.getItem('crivo_cep_original_s2')
  if (numeroSistema === 2 && cepOriginal) {
    const campoCep = camposDeCepVisiveis()[0]
    if (campoCep && campoCep.value !== cepOriginal) {
      log(2, consulta.id, `Devolvendo o CEP da negociação (${cepOriginal}) antes deste CNPJ`)
      await digitarTexto(campoCep, cepOriginal)
      campoCep.dispatchEvent(new Event('blur', { bubbles: true }))
      const lupa = automation.acharBotaoBuscarCep(campoCep)
      if (lupa) lupa.click()
      await dormir(1200)
    }
    sessionStorage.removeItem('crivo_cep_original_s2')
  }
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

    // 1.7.3 (Brayan): não troca mais o CEP antes de avançar. Só troca
    // pelo CEP da empresa se a TIM der o erro de estado (veja mais abaixo).

    // 1.7.5 (Brayan: "mais rápida"): o log mostrou a tela marcando
    // "CEP | Complemento" como inválidos e a extensão esperando 12s pra
    // nada, depois religando. Agora, passados 2s (ou 4s se ainda tiver
    // campo marcado), clica Avançar igual uma pessoa faria: se faltar
    // algo de verdade, a própria TIM avisa e a regra de erro cuida.
    // 1.7.8: "Razão Social" vazia = a negociação sumiu da tela (formulário
    // em branco). Avançar assim levava pra lista "Pesquisar Negociações",
    // que era lida como resposta e reprovava. Aí trata como erro (religa).
    const formularioEmBranco = tempoMinimoPassou && invalidos.some((c) => /raz[aã]o social/i.test(c))
    if (formularioEmBranco && decorrido >= 4000) {
      await finalizarComRetry(numeroSistema, andamento.consulta.id, {
        erro: `[${numeroSistema}º sistema] a tela da 1ª venda está em branco (sem Razão Social da negociação)`,
      }, automation)
      return true
    }
    const podeAvancar = tempoMinimoPassou && !formularioEmBranco && (invalidos.length === 0 || decorrido >= 4000)
    if (podeAvancar) {
      const estadoAgora = automation.detectarEstado()
      if (estadoAgora.tipo === 'formulario') {
        log(numeroSistema, andamento.consulta.id, invalidos.length
          ? `Clicando Avançar (campos marcados na tela: ${invalidos.join(' | ')})`
          : 'Campos da empresa validados, clicando Avançar agora')
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

    // 1.6.4: os dados da empresa carregam em ~2s; 20s sem carregar é
    // tela travada (antes esperava 90s e o CNPJ ia pra outro PC antes).
    if (decorrido < TIMEOUT_DADOS_S2_MS) return false
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
      if (numeroSistema === 2) await religarSegundoSistema(automation, andamento.consulta.id)
      return true
    }
    if (numeroSistema === 2) {
      // 1.6.4: na tela de termos o 2º sistema se religa e consulta de novo.
      sessionStorage.setItem(chaveTentativas(andamento.consulta.id), String(tentativasFeitas(andamento.consulta.id) + 1))
      log(numeroSistema, andamento.consulta.id, 'Caiu na tela de termos — religando o 2º sistema pela negociação')
      await religarSegundoSistema(automation, andamento.consulta.id)
      return true
    }
    log(numeroSistema, andamento.consulta.id, 'Caiu na tela de Contrato — voltando uma página e esperando o resultado')
    automation.voltarUmaPagina()
    andamento.aguardandoSairDoContrato = true
    return false
  }

  if (reconhecido || (textoNovo && andamento.estavel >= ESTAVEL_MIN)) {
    if (ehErroDeEstado(textoNovo)) {
      const consulta = andamento.consulta
      if (numeroSistema === 1 && !sessionStorage.getItem(chaveCepEmpresa(consulta.id))) {
        const cep = await buscarCepDaEmpresa(consulta.cnpj, consulta.id, 1)
        if (cep) {
          sessionStorage.setItem(chaveCepEmpresa(consulta.id), cep)
          log(1, consulta.id, `Erro de estado no 1º sistema: refazendo com o CEP da empresa (${cep})`)
          await dormir(300)
          recarregarLimpo()
          return true
        }
      }
    }
    // 1.7.6 (Brayan): no 2º sistema, "Formulário com pendências", erro de
    // estado ou "Endereço/Bairro... é obrigatório" → coloca o CEP e o
    // endereço do cartão CNPJ da empresa e avança de novo (uma vez).
    // "Telefone inválido" segue a regra própria (logo abaixo).
    if (numeroSistema === 2 && precisaEnderecoDaEmpresa(textoNovo)) {
      const consulta = andamento.consulta
      if (!andamento.cepEmpresaTentado) {
        andamento.cepEmpresaTentado = true
        log(2, consulta.id, `Aviso de endereço/pendência: colocando CEP e endereço do cartão CNPJ (${textoNovo.slice(0, 80)})`)
        const empresa = await buscarCepDaEmpresa(consulta.cnpj, consulta.id, 2, { comUf: true })
        if (empresa && (await trocarCepNoSegundoSistema(automation, consulta.id, empresa.cep, empresa))) {
          andamento.fase = 'aguardando_dados'
          andamento.ultimoTextoNovo = ''
          andamento.estavel = 0
          andamento.iniciadoEm = Date.now()
          return false
        }
      }
    }
    // 1.7.8: tela de lista (Pesquisar Negociações/Clientes) não é resposta.
    // 1.7.9: "Razão Social é obrigatória" = tela da 1ª venda em branco.
    if (/pesquisar (negociac|client)|linhas por pagina|razao social e obrigatori/.test(semAcento(textoNovo))) {
      await finalizarComRetry(numeroSistema, andamento.consulta.id, {
        erro: `[${numeroSistema}º sistema] caiu numa tela de lista em vez da resposta: ${textoNovo.slice(0, 80)}`,
      }, automation)
      return true
    }
    const resultado = reconhecido || automation.classificarMensagem(textoNovo, numeroSistema)
    log(numeroSistema, andamento.consulta.id, 'Mensagem de resultado:', textoNovo, '— Resultado:', resultado)
    if (numeroSistema === 2 && /telefone invalido/.test(semAcento(textoNovo)) &&
        (andamento.consulta.repasses || 0) > 0 && !andamento.cliquouTelefone) {
      // 1.7.2 (16/11/2026, Brayan): o CNPJ já veio de outro PC e deu
      // "Telefone inválido" de novo: clica no campo Telefone e avança de
      // novo (uma vez). Se der o erro outra vez, segue a regra de baixo.
      andamento.cliquouTelefone = true
      automation.fecharModal()
      await dormir(800)
      const telefones = [...document.querySelectorAll('input')].filter((i) => {
        if (!visivel(i)) return false
        const label = i.parentElement?.querySelector('label')
        const attrs = semAcento([i.name, i.id, i.getAttribute('ng-model'), label?.textContent].filter(Boolean).join(' '))
        return /telefone/.test(attrs)
      })
      const alvo = telefones.find((i) => i.matches('.ng-invalid, [aria-invalid="true"]')) || telefones[0]
      log(2, andamento.consulta.id, `Telefone inválido no 2º PC: clicando no campo Telefone${alvo ? '' : ' (campo não achado)'} e avançando de novo`)
      if (alvo) {
        alvo.scrollIntoView({ block: 'center' })
        alvo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        alvo.focus()
        alvo.click()
        alvo.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        await dormir(600)
        alvo.dispatchEvent(new Event('change', { bubbles: true }))
        alvo.dispatchEvent(new Event('blur', { bubbles: true }))
        alvo.blur()
      }
      await dormir(800)
      andamento.fase = 'aguardando_dados'
      andamento.estadoConferido = true
      andamento.ultimoTextoNovo = ''
      andamento.estavel = 0
      andamento.iniciadoEm = Date.now() - 2000
      return false
    }
    if (numeroSistema === 2 && /telefone invalido/.test(semAcento(textoNovo))) {
      // 1.7.0 (16/11/2026, Brayan): "Telefone inválido" no 2º sistema
      // passa o CNPJ pra outro PC (o banco guarda o 1º sistema e só refaz o
      // 2º lá) e este PC pega o próximo da fila. Sem outro PC online, o
      // chat avisa pra mandar de novo.
      log(2, andamento.consulta.id, 'Telefone inválido: passando este CNPJ pra outro PC e pegando o próximo')
      automation.fecharModal()
      sessionStorage.removeItem(chaveTentativas(andamento.consulta.id))
      await salvarResultado(andamento.consulta.id, 2, { erro: '[2º sistema] Telefone inválido — passado pra outro PC' })
      return true
    }
    if (resultado === 'formulario_incompleto' && numeroSistema === 2 && (andamento.avancouDeNovo || 0) < 2) {
      // 1.6.9: no teste, o mesmo CNPJ dava "Telefone inválido" e na 2ª
      // vez passava. Fecha o aviso e clica Avançar de novo (sem religar).
      andamento.avancouDeNovo = (andamento.avancouDeNovo || 0) + 1
      log(2, andamento.consulta.id, `Formulário com pendências: fechando o aviso e avançando de novo (${andamento.avancouDeNovo}/2)`)
      automation.fecharModal()
      await dormir(1500)
      andamento.fase = 'aguardando_dados'
      andamento.estadoConferido = true
      andamento.ultimoTextoNovo = ''
      andamento.estavel = 0
      andamento.iniciadoEm = Date.now() - 2000
      return false
    }
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
  await atualizarNomeNegociacao()
  setInterval(atualizarNomeNegociacao, ATUALIZAR_CEP_PADRAO_MS)

  const automation = new EasyVendasAutomation(EASYVENDAS_SELECTORS)
  laco(numeroSistema, automation)
}

iniciar()
