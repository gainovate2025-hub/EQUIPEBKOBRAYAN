// portal-automation.js
// -----------------------------------------------------------------------
// Lógica da automação do Portal Parcelamento, separada dos seletores
// (portal-selectors.js) e da orquestração (portal.js) — mesmo princípio
// do projeto Crivo (veja easyvendas-automation.js): cada método aqui é
// uma ação curta sobre o estado ATUAL da tela. Quem decide o que fazer a
// seguir é o laço em portal.js, olhando a tela a cada rodada.
// -----------------------------------------------------------------------

function semAcento(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

class PortalAutomation {
  constructor(selectors) {
    this.selectors = selectors
  }

  definirValorInput(input, valor) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  // Acha um botão/link cujo texto OU aria-label contenha um dos alvos
  // (sem acento/maiúscula), dentro de um container qualquer. Fica com o
  // elemento de texto MAIS CURTO entre os que batem, pra não pegar um
  // contêiner grande por cima do botão de verdade.
  acharBotaoDentro(container, alvos) {
    const normalizados = alvos.map((a) => semAcento(a).trim())
    const elementos = [...container.querySelectorAll('button, [role="button"], a, input[type="submit"], input[type="button"]')]
    let melhor = null
    for (const el of elementos) {
      const texto = semAcento(`${el.textContent || el.value || ''} ${el.getAttribute('aria-label') || ''}`).trim()
      if (!texto) continue
      const bate = normalizados.some((alvo) => texto.includes(alvo))
      if (!bate) continue
      if (!melhor || texto.length < melhor.texto.length) melhor = { el, texto }
    }
    return melhor?.el || null
  }

  acharBotaoPorTexto(alvos) {
    return this.acharBotaoDentro(document, alvos)
  }

  // Acha um <input> pelo rótulo/placeholder/aria-label ao redor dele —
  // usado pras telas de login (USERNAME, TOKEN), que não têm id fixo
  // conhecido.
  acharCampoPorRotulo(rotulo) {
    const alvo = semAcento(rotulo)
    const inputs = [...document.querySelectorAll('input')]
    for (const input of inputs) {
      const atributos = semAcento(
        [input.placeholder, input.getAttribute('aria-label'), input.name, input.id].filter(Boolean).join(' ')
      )
      if (atributos.includes(alvo)) return input

      let container = input.closest('div, label, section') || input.parentElement
      for (let nivel = 0; container && nivel < 4; nivel++, container = container.parentElement) {
        if (semAcento(container.textContent || '').includes(alvo)) return input
      }
    }
    return null
  }

  // Etapa 1 do login (SSO, tela "Sign On"): só o campo USERNAME, sem
  // campo de TOKEN nela (isso distingue da etapa 2, que tem os dois).
  detectarTelaLoginUsuario() {
    if (this.acharCampoPorRotulo(this.selectors.loginTokenRotulo)) return null
    const campo = this.acharCampoPorRotulo(this.selectors.loginUsuarioRotulo)
    const botao = this.acharBotaoPorTexto(this.selectors.loginBotaoAvancarTextos)
    return campo && botao ? { campo, botao } : null
  }

  preencherUsuarioEAvancar(etapa, usuario) {
    this.definirValorInput(etapa.campo, usuario)
    etapa.botao.click()
  }

  // Etapa 2 do login: USUÁRIO já vem preenchido pela etapa 1, só falta
  // o TOKEN do RSA SecurID.
  detectarTelaLoginToken() {
    const campo = this.acharCampoPorRotulo(this.selectors.loginTokenRotulo)
    const botao = this.acharBotaoPorTexto(this.selectors.loginBotaoEntrarTextos)
    return campo && botao ? { campo, botao } : null
  }

  preencherTokenEEntrar(etapa, token) {
    this.definirValorInput(etapa.campo, token)
    etapa.botao.click()
  }

  // Acha o container (linha/bloco) da tela cujo texto contenha um trecho
  // dado — usado pra achar a seção "Faturas Em Aberto" ou a opção
  // "IMPRESSÃO ONLINE" sem depender de id.
  acharContainerPorTexto(trecho, tags = ['tr', 'div', 'li', 'label']) {
    const alvo = semAcento(trecho)
    for (const tag of tags) {
      const candidatos = [...document.querySelectorAll(tag)]
      // do mais específico (menor) pro mais genérico, pra achar o
      // elemento mais próximo do texto, não um wrapper gigante.
      candidatos.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0))
      for (const el of candidatos) {
        if (semAcento(el.textContent || '').includes(alvo)) return el
      }
    }
    return null
  }

  campoCustcode() {
    return document.querySelector(this.selectors.campoCustcodeSeletor)
  }

  radioCustcode() {
    return document.querySelector(this.selectors.radioCustcodeSeletor)
  }

  comboMotivo() {
    return document.querySelector(this.selectors.comboMotivoSeletor)
  }

  botaoBuscar() {
    return document.querySelector(this.selectors.botaoBuscarSeletor)
  }

  // Tela inicial de busca por Custcode — precisa ter o campo E o botão
  // buscar visíveis.
  detectarTelaBusca() {
    const campo = this.campoCustcode()
    const botao = this.botaoBuscar()
    return campo && botao ? { campo, botao } : null
  }

  preencherEBuscar(custcode) {
    const radio = this.radioCustcode()
    if (radio) radio.click()

    const combo = this.comboMotivo()
    if (combo) {
      const opcoes = [...combo.options]
      const alvo = opcoes.find((o) => semAcento(o.textContent).includes(this.selectors.motivoAlvoTexto))
      if (alvo) {
        combo.value = alvo.value
        combo.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }

    const campo = this.campoCustcode()
    this.definirValorInput(campo, custcode)

    this.botaoBuscar().click()
  }

  textoDaTela() {
    return document.body.innerText || ''
  }

  pareceSemFatura() {
    return this.selectors.padraoSemFatura.test(semAcento(this.textoDaTela()))
  }

  // Lista as faturas em aberto encontradas na tela. Cada item tem um
  // "chave" derivado do texto da própria linha (data/valor mostrados) —
  // NÃO um id de DOM — pra continuar identificando a mesma fatura mesmo
  // que a tela seja recarregada, e pra saber quais já foram processadas
  // quando o cliente tem mais de uma fatura em aberto.
  listarFaturas() {
    const container = this.acharContainerPorTexto(this.selectors.tituloFaturasEmAberto, ['div', 'table', 'section'])
    const escopo = container || document
    const bolinhas = [...escopo.querySelectorAll('.ui-radiobutton-box, input[type="radio"]')]
    return bolinhas
      .map((el) => {
        const clicavel = el.classList?.contains('ui-radiobutton-box') ? el : el
        const linha = el.closest('tr, li, div')
        const chave = semAcento(linha?.textContent || '').trim().slice(0, 120) || `fatura-${bolinhas.indexOf(el)}`
        return { elemento: clicavel, chave }
      })
      .filter((f) => f.chave)
  }

  proximaFaturaNaoProcessada(faturasProcessadas) {
    const faturas = this.listarFaturas()
    return faturas.find((f) => !faturasProcessadas.includes(f.chave)) || null
  }

  selecionarFatura(fatura) {
    fatura.elemento.click()
  }

  botaoConfirmarFatura() {
    return document.querySelector(this.selectors.botaoConfirmarFaturaSeletor)
  }

  clicarConfirmarFatura() {
    const botao = this.botaoConfirmarFatura()
    if (botao) { botao.click(); return true }
    return false
  }

  // Opção "IMPRESSÃO ONLINE" — acha o container com esse texto e clica na
  // bolinha de rádio de dentro dele.
  selecionarImpressaoOnline() {
    const container = this.acharContainerPorTexto(this.selectors.textoImpressaoOnline)
    if (!container) return false
    const bolinha = container.querySelector('.ui-radiobutton-box, input[type="radio"]') || container.closest('tr, li')?.querySelector('.ui-radiobutton-box, input[type="radio"]')
    if (!bolinha) return false
    bolinha.click()
    return true
  }

  clicarConfirmarGenerico() {
    const botao = this.acharBotaoPorTexto(this.selectors.textosBotaoConfirmar)
    if (botao) { botao.click(); return true }
    return false
  }

  ehTelaDePdf() {
    return this.selectors.pareceUrlDePdf(location.href) || document.contentType === 'application/pdf'
  }

  // Baixa o PDF direto por fetch (usa os cookies da sessão atual — a
  // extensão está na mesma origem/aba, então não precisa de nenhuma
  // permissão extra) e devolve como base64, pronto pra mandar pro
  // WhatsApp Web depois.
  async baixarPdfComoBase64() {
    const resposta = await fetch(location.href, { credentials: 'include' })
    const blob = await resposta.blob()
    return new Promise((resolve, reject) => {
      const leitor = new FileReader()
      leitor.onload = () => resolve(leitor.result.split(',')[1])
      leitor.onerror = reject
      leitor.readAsDataURL(blob)
    })
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PortalAutomation }
}
