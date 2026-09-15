// Extensão Crivo — Easy Vendas (portaleasyvendas.timbrasil.com.br)
//
// Fica de olho na tabela crivo_consultas (Supabase). Quando aparece uma
// consulta pendente, digita o CNPJ no campo da tela de "Dados do cliente"
// (dentro de uma Negociação — a que tem os botões CANCELAR/SALVAR/
// CRÉDITO/AVANÇAR), clica em CRÉDITO, lê a mensagem da janela "Análise de
// crédito" que abre e devolve aprovado/reprovado.
//
// IMPORTANTE — como preparar a tela: essa extensão NÃO cria uma negociação
// nova sozinha. Antes de ligar, deixa a aba aberta numa tela de
// "Negociações" > "Dados do cliente" (não precisa ser de um cliente real —
// só usa o campo CNPJ pra consultar, nunca clica em SALVAR). A extensão
// fica reaproveitando essa mesma tela pra cada CNPJ novo, trocando só o
// valor do campo CNPJ.
//
// O 1º e o 2º sistema são o MESMO site (só logins/contas diferentes), então
// essa mesma extensão serve pros dois — em cada ABA aberta no Easy Vendas,
// clica no ícone da extensão e escolhe se aquela aba é o "1º sistema" ou o
// "2º sistema". Essa escolha é guardada por aba (pelo background.js), então
// mudar uma aba não mexe na outra. Sem escolha feita, assume "1º sistema".
//
// Não precisa de login nenhum aqui — usa a chave pública (anon) do Supabase,
// que só permite mexer em consultas ainda "pendente" (veja migration_013).

const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

const INTERVALO_BUSCA_MS = 5000
const TIMEOUT_RESULTADO_MS = 15000

// Fallback (formato antigo, caso ainda apareça em algum caso não visto).
const PALAVRAS_REPROVADO_FALLBACK = [
  /\btim\b/,
  /duvidas? financeiras?/,
  /restric/,
  /cheque sem fundo/,
]

function semAcento(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

async function pegarNumeroSistema() {
  try {
    const resp = await chrome.runtime.sendMessage({ tipo: 'crivo:pegarSistema' })
    return resp?.numero === 2 ? 2 : 1
  } catch {
    return 1
  }
}

function log(numeroSistema, ...args) {
  console.log(`[Crivo/EasyVendas #${numeroSistema}]`, ...args)
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

async function buscarPendente(numeroSistema) {
  const campoResultado = `sistema${numeroSistema}_resultado`
  const linhas = await supaFetch(
    `crivo_consultas?select=*&status=eq.pendente&${campoResultado}=is.null&order=created_at.asc&limit=1`
  )
  return linhas?.[0] || null
}

// Grava pela função do banco (RPC), não direto na tabela — veja
// migration_017_crivo_rpc.sql pro motivo.
async function salvarResultado(id, numeroSistema, { resultado = null, motivo = null, erro = null }) {
  await supaFetch('rpc/crivo_salvar_resultado', {
    method: 'POST',
    body: JSON.stringify({
      p_id: id,
      p_numero_sistema: numeroSistema,
      p_resultado: resultado,
      p_motivo: motivo,
      p_erro: erro,
    }),
    prefer: 'return=minimal',
  })
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Acha o <input> do CNPJ procurando por um rótulo/texto "CNPJ" perto dele.
function acharCampoCnpj() {
  const inputs = [...document.querySelectorAll('input')]
  for (const input of inputs) {
    const container = input.closest('div, label, section') || input.parentElement
    const texto = semAcento(container?.textContent || '')
    if (texto.includes('cnpj')) return input
  }
  return null
}

// Acha um botão pelo texto exato (sem acento/maiúscula) — ex: "CRÉDITO", "OK".
function acharBotaoPorTexto(...alvos) {
  const normalizados = alvos.map((a) => semAcento(a).trim())
  const elementos = [...document.querySelectorAll('button, [role="button"], a')]
  for (const el of elementos) {
    const texto = semAcento(el.textContent || '').trim()
    if (normalizados.includes(texto)) return el
  }
  return null
}

function definirValorInput(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
}

function formatarCnpj(digitos) {
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function textoDaTela() {
  return (document.body.innerText || '')
}

function linhas(texto) {
  return texto.split('\n').map((l) => l.trim()).filter(Boolean)
}

// Compara o texto da tela antes/depois de clicar em CRÉDITO e devolve só o
// que APARECEU de novo — é assim que a extensão acha a janela "Análise de
// crédito" sem depender de saber a estrutura exata do modal (class, id
// etc.), que a gente não tem como inspecionar direto.
function linhasNovas(anterior, atual) {
  const antigas = new Set(linhas(anterior))
  return linhas(atual).filter((l) => !antigas.has(l))
}

// Dentro das linhas novas (o conteúdo do modal), acha a mensagem da
// "Análise de crédito" — tira o título e o botão "OK", fica só com a frase
// do resultado (ex: "RECOMENDADO MEI. Recomendado valor de compra.").
function extrairMensagemModal(linhasModal) {
  for (let i = 0; i < linhasModal.length; i++) {
    const linha = linhasModal[i]
    const normalizada = semAcento(linha)
    const posicao = normalizada.indexOf('analise de credito')
    if (posicao === -1) continue

    // às vezes o título e a mensagem vêm na mesma linha
    const restoMesmaLinha = linha.slice(posicao + 'analise de credito'.length).trim()
    if (restoMesmaLinha.length > 5 && semAcento(restoMesmaLinha) !== 'ok') return restoMesmaLinha

    // senão, a mensagem é a(s) linha(s) seguinte(s) (tirando o "OK" do botão)
    const seguintes = linhasModal.slice(i + 1).filter((l) => semAcento(l) !== 'ok')
    if (seguintes.length > 0) return seguintes.join(' ').trim()
  }
  return null
}

function ehNaoEncontrado(texto) {
  return /nao solicitada|nao encontrad/.test(semAcento(texto))
}

// A mensagem da "Análise de crédito" começa com "RECOMENDADO" quando dá pra
// vender, e (por dedução — ainda não vimos um caso reprovado de verdade)
// deve começar com "NÃO RECOMENDADO" quando não dá. Guarda também os
// padrões antigos como reforço, caso apareça alguma variação diferente.
function classificarModal(mensagem) {
  const normalizado = semAcento(mensagem)
  if (/nao recomendado|nao aprovado/.test(normalizado)) return 'reprovado'
  if (/recomendado|aprovado/.test(normalizado)) return 'aprovado'
  const reprovadoFallback = PALAVRAS_REPROVADO_FALLBACK.some((re) => re.test(normalizado))
  return reprovadoFallback ? 'reprovado' : 'aprovado'
}

async function processarConsulta(numeroSistema, consulta) {
  log(numeroSistema, 'Processando CNPJ', consulta.cnpj)

  try {
    const campoCnpj = acharCampoCnpj()
    if (!campoCnpj) {
      throw new Error(
        'não achei o campo de CNPJ — deixa a aba aberta numa tela de Negociação > "Dados do cliente" (com os botões CRÉDITO/AVANÇAR)'
      )
    }

    // Limpa antes de digitar: se o campo já tiver ESSE MESMO cnpj de uma
    // tentativa anterior, digitar o mesmo valor de novo pode não disparar
    // nada — a tela não percebe "mudança" nenhuma.
    definirValorInput(campoCnpj, '')
    await dormir(150)
    definirValorInput(campoCnpj, formatarCnpj(consulta.cnpj))
    await dormir(300)

    const botaoCredito = acharBotaoPorTexto('credito')
    if (!botaoCredito) throw new Error('não achei o botão CRÉDITO na tela')

    const antesTexto = textoDaTela()
    log(numeroSistema, '[debug] clicando em CRÉDITO com o campo CNPJ =', JSON.stringify(campoCnpj.value))
    botaoCredito.click()

    // espera a janela "Análise de crédito" aparecer (compara o texto da
    // tela inteira antes/depois, pra achar o que apareceu de novo)
    const inicio = Date.now()
    let mensagem = null
    while (Date.now() - inicio < TIMEOUT_RESULTADO_MS) {
      await dormir(400)
      const atual = textoDaTela()
      const novas = linhasNovas(antesTexto, atual)
      mensagem = extrairMensagemModal(novas)
      if (mensagem) break
    }

    if (!mensagem) {
      const atual = textoDaTela()
      log(numeroSistema, '[debug] não achou o modal a tempo. Linhas novas:', JSON.stringify(linhasNovas(antesTexto, atual)))
      throw new Error('a janela "Análise de crédito" não apareceu a tempo — confere se a extensão está numa tela de Negociação válida')
    }

    log(numeroSistema, 'Mensagem da Análise de crédito:', mensagem)

    // fecha a janela, pra deixar pronta pro próximo CNPJ
    const botaoOk = acharBotaoPorTexto('ok', 'fechar')
    if (botaoOk) botaoOk.click()

    const resultado = ehNaoEncontrado(mensagem) ? 'nao_encontrado' : classificarModal(mensagem)
    log(numeroSistema, 'Resultado:', resultado)

    await salvarResultado(consulta.id, numeroSistema, { resultado, motivo: mensagem })
  } catch (err) {
    log(numeroSistema, 'Erro:', err.message)
    await salvarResultado(consulta.id, numeroSistema, { erro: `[${numeroSistema}º sistema] ${err.message}` })
  }
}

let ocupado = false
async function cicloDeChecagem(numeroSistema) {
  if (ocupado) return
  ocupado = true
  try {
    const consulta = await buscarPendente(numeroSistema)
    if (consulta) await processarConsulta(numeroSistema, consulta)
  } catch (err) {
    log(numeroSistema, 'Falha ao checar pendências:', err.message)
  } finally {
    ocupado = false
  }
}

async function iniciar() {
  const numeroSistema = await pegarNumeroSistema()
  log(numeroSistema, 'Ativo em', location.href)
  setInterval(() => cicloDeChecagem(numeroSistema), INTERVALO_BUSCA_MS)
  cicloDeChecagem(numeroSistema)

  // se a pessoa trocar a escolha dessa aba no ícone da extensão, o
  // background.js manda recarregar pra já começar a valer.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'crivo:recarregar') location.reload()
  })
}

iniciar()
