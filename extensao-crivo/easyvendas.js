// Extensão Crivo — Easy Vendas (portaleasyvendas.timbrasil.com.br)
//
// Fica de olho na tabela crivo_consultas (Supabase). Quando aparece uma
// consulta pendente, digita o CNPJ no Easy Vendas, clica em buscar, lê a
// mensagem de "Pré-Análise de Crédito" e devolve aprovado/reprovado.
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
const TIMEOUT_RESULTADO_MS = 12000

const PALAVRAS_REPROVADO = [
  /\btim\b/, // qualquer menção a "Tim" na mensagem = reprovado
  /duvidas? financeiras?/,
  /restric/, // "sócios com restrição..."
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

// O botão de busca (lupa) normalmente é o próximo elemento clicável depois
// do campo CNPJ, dentro do mesmo bloco.
function acharBotaoBusca(campoCnpj) {
  const bloco = campoCnpj.closest('div')
  if (!bloco) return null
  let atual = bloco
  for (let i = 0; i < 4 && atual; i++) {
    const botao = atual.querySelector('button, md-icon, [role="button"]')
    if (botao) return botao.closest('button, [role="button"]') || botao
    atual = atual.parentElement
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

// Procura na página o texto da "Pré-Análise" e devolve só a frase do
// resultado — não o bloco/tela inteira onde ela está encaixada.
//
// Como a tela tem vários elementos "pai" cujo texto (somando os dos filhos
// todos) também contém "pré-análise" — um card, uma coluna, a página
// inteira —, pegar o PRIMEIRO que bate dá bug (pega esses blocos gigantes,
// com menu/formulário/botões junto, que às vezes têm até a palavra "TIM" da
// marca em algum canto e classificavam errado). Por isso: junta todo mundo
// que bate e fica com o texto MAIS CURTO — que é sempre a frase certinha,
// nunca o contêiner por cima dela.
function lerPreAnalise() {
  let melhor = null
  for (const el of document.querySelectorAll('body *')) {
    const texto = (el.textContent || '').trim()
    if (texto.length <= 12 || !/pr[ée]-an[áa]lise/i.test(texto)) continue
    if (!melhor || texto.length < melhor.length) melhor = texto
  }
  return melhor
}

function ehNaoEncontrado(texto) {
  return /nao solicitada|nao encontrad/.test(semAcento(texto))
}

function classificar(textoPreAnalise) {
  const normalizado = semAcento(textoPreAnalise)
  const reprovado = PALAVRAS_REPROVADO.some((re) => re.test(normalizado))
  return reprovado ? 'reprovado' : 'aprovado'
}

async function processarConsulta(numeroSistema, consulta) {
  log(numeroSistema, 'Processando CNPJ', consulta.cnpj)

  try {
    const campoCnpj = acharCampoCnpj()
    if (!campoCnpj) throw new Error('não achei o campo de CNPJ na tela')

    // Limpa antes de digitar: se o campo já tiver ESSE MESMO cnpj de uma
    // tentativa anterior (ex: reprocessando um erro), digitar o mesmo valor
    // de novo pode não disparar a busca — a tela não percebe "mudança"
    // nenhuma. Passar por vazio primeiro garante que sempre conta como novo.
    definirValorInput(campoCnpj, '')
    await dormir(150)
    definirValorInput(campoCnpj, formatarCnpj(consulta.cnpj))
    await dormir(400)

    const botaoBusca = acharBotaoBusca(campoCnpj)
    if (!botaoBusca) throw new Error('não achei o botão de buscar ao lado do CNPJ')
    botaoBusca.click()

    // espera o resultado da pré-análise aparecer/mudar. Importante: NÃO
    // aceita "não solicitada" assim que vê — esse texto também aparece
    // rapidinho enquanto a tela ainda está carregando o resultado de
    // verdade (já vimos isso classificar CNPJ válido como "CNPJ errado" por
    // engano). Só aceita se o texto ainda estiver assim depois do prazo
    // inteiro — aí sim é porque realmente não carregou nada.
    const inicio = Date.now()
    let textoAnterior = lerPreAnalise()
    let textoFinal = null
    while (Date.now() - inicio < TIMEOUT_RESULTADO_MS) {
      await dormir(500)
      const atual = lerPreAnalise()
      if (atual && atual !== textoAnterior) {
        textoFinal = atual
        break
      }
    }
    // Se não mudou dentro do prazo, só confia nisso se for claramente "não
    // encontrado" (faz sentido nunca mudar). Qualquer outro caso continua
    // sendo erro — não dá pra confiar que não é sobra da consulta anterior.
    if (!textoFinal) {
      const atualFinal = lerPreAnalise()
      if (atualFinal && ehNaoEncontrado(atualFinal)) {
        textoFinal = atualFinal
      } else {
        throw new Error('a tela não mostrou um resultado novo a tempo (pode ter ficado com o resultado da consulta anterior) — tenta de novo')
      }
    }

    const resultado = ehNaoEncontrado(textoFinal) ? 'nao_encontrado' : classificar(textoFinal)
    log(numeroSistema, 'Resultado:', resultado, '—', textoFinal)

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
