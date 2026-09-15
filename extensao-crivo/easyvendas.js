// Extensão Crivo — Easy Vendas (portaleasyvendas.timbrasil.com.br)
//
// Fica de olho na tabela crivo_consultas (Supabase). Quando aparece uma
// consulta pendente, digita o CNPJ no campo "Cliente" da tela
// "Detalhamento de Cliente", clica em SOLICITAR e lê o resultado que
// aparece do lado de "Pré-Análise de Crédito -" (aprovado/reprovado).
//
// IMPORTANTE — como preparar a tela: essa extensão NÃO abre a tela
// sozinha. Antes de ligar, deixa a aba aberta numa tela "Detalhamento de
// Cliente" (a que tem "Pré-Análise de Crédito" no topo e os campos CNPJ +
// Cliente + CEP). A extensão fica reaproveitando essa mesma tela pra cada
// CNPJ novo — digita no campo "Cliente" (não mexe no campo "CNPJ" do
// topo, que fica fixo) e clica SOLICITAR.
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

const PALAVRAS_REPROVADO = [
  /\btim\b/, // qualquer menção a "Tim" na mensagem = reprovado
  /duvidas? financeiras?/,
  /restric/, // "sócios/cliente com restrição..."
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

// Acha o campo de BUSCA "Cliente" (onde se digita o CNPJ a consultar) —
// não confundir com o campo "CNPJ" do topo (esse fica fixo, é de outro
// cliente/negociação) nem com "Tipo cliente".
function acharCampoClienteBusca() {
  const inputs = [...document.querySelectorAll('input')]
  for (const input of inputs) {
    const container = input.closest('div, label, section') || input.parentElement
    const texto = semAcento(container?.textContent || '')
    if (texto.includes('cliente') && !texto.includes('tipo cliente') && !texto.includes('cnpj')) {
      return input
    }
  }
  return null
}

// Acha um botão cujo texto CONTENHA um dos alvos (sem acento/maiúscula) —
// ex: "SOLICITAR". Não exige igualdade exata porque o botão às vezes tem
// um ícone junto que entra no texto — fica com o elemento de texto MAIS
// CURTO entre os que batem, pra não pegar sem querer um contêiner grande.
function acharBotaoPorTexto(...alvos) {
  const normalizados = alvos.map((a) => semAcento(a).trim())
  const elementos = [...document.querySelectorAll('button, [role="button"], a')]
  let melhor = null
  for (const el of elementos) {
    const texto = semAcento(el.textContent || '').trim()
    if (!texto) continue
    const bate = normalizados.some((alvo) => texto.includes(alvo))
    if (!bate) continue
    if (!melhor || texto.length < melhor.texto.length) melhor = { el, texto }
  }
  return melhor?.el || null
}

function definirValorInput(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
}

// Acha a linha "Pré-Análise de Crédito - [resultado]" na tela e devolve só
// a parte depois do hífen. Só aceita elementos de texto curto (a frase em
// si), não um contêiner grande por cima dela.
function lerPreAnalise() {
  for (const el of document.querySelectorAll('body *')) {
    const texto = (el.textContent || '').trim()
    if (texto.length > 220 || !/pr[ée]-an[áa]lise de cr[ée]dito/i.test(texto)) continue
    const match = texto.match(/pr[ée]-an[áa]lise de cr[ée]dito\s*-?\s*(.+)/i)
    if (match && match[1].trim()) return match[1].trim()
  }
  return null
}

function ehNaoEncontrado(texto) {
  return /nao solicitada|nao encontrad/.test(semAcento(texto))
}

function classificar(texto) {
  const normalizado = semAcento(texto)
  const reprovado = PALAVRAS_REPROVADO.some((re) => re.test(normalizado))
  return reprovado ? 'reprovado' : 'aprovado'
}

async function processarConsulta(numeroSistema, consulta) {
  log(numeroSistema, 'Processando CNPJ', consulta.cnpj)

  try {
    const campoCliente = acharCampoClienteBusca()
    if (!campoCliente) {
      throw new Error(
        'não achei o campo "Cliente" — deixa a aba aberta numa tela "Detalhamento de Cliente" (com Pré-Análise de Crédito no topo)'
      )
    }

    // Limpa antes de digitar: se o campo já tiver ESSE MESMO cnpj de uma
    // tentativa anterior, digitar o mesmo valor de novo pode não disparar
    // nada — a tela não percebe "mudança" nenhuma.
    definirValorInput(campoCliente, '')
    await dormir(150)
    definirValorInput(campoCliente, consulta.cnpj)
    await dormir(300)

    let botaoSolicitar = null
    for (let i = 0; i < 6 && !botaoSolicitar; i++) {
      botaoSolicitar = acharBotaoPorTexto('solicitar')
      if (!botaoSolicitar) await dormir(500)
    }
    if (!botaoSolicitar) throw new Error('não achei o botão SOLICITAR na tela')

    log(numeroSistema, '[debug] clicando em SOLICITAR com o campo Cliente =', JSON.stringify(campoCliente.value))
    const textoAnterior = lerPreAnalise()
    botaoSolicitar.click()

    // espera o resultado mudar. "Não solicitada" pode aparecer rapidinho
    // enquanto ainda está carregando — só aceita se persistir até o fim do
    // prazo (aí sim é porque não achou nada pra esse CNPJ).
    const inicio = Date.now()
    let textoFinal = null
    while (Date.now() - inicio < TIMEOUT_RESULTADO_MS) {
      await dormir(500)
      const atual = lerPreAnalise()
      if (atual && atual !== textoAnterior) {
        textoFinal = atual
        break
      }
    }
    if (!textoFinal) {
      const atualFinal = lerPreAnalise()
      if (atualFinal && ehNaoEncontrado(atualFinal)) {
        textoFinal = atualFinal
      } else {
        log(numeroSistema, '[debug] texto de Pré-Análise não mudou. Valor atual:', JSON.stringify(lerPreAnalise()))
        throw new Error('a tela não mostrou um resultado novo a tempo (pode ter ficado com o resultado da consulta anterior) — tenta de novo')
      }
    }

    log(numeroSistema, 'Pré-Análise de Crédito:', textoFinal)

    const resultado = ehNaoEncontrado(textoFinal) ? 'nao_encontrado' : classificar(textoFinal)
    log(numeroSistema, 'Resultado:', resultado)

    await salvarResultado(consulta.id, numeroSistema, { resultado, motivo: textoFinal })
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
