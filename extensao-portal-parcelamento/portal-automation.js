// portal-automation.js
// -----------------------------------------------------------------------
// Lógica da automação do Portal Parcelamento, separada dos seletores
// (portal-selectors.js) e da orquestração (portal.js) — cada método aqui
// é uma ação curta sobre o estado ATUAL da tela. Quem decide o que fazer
// a seguir é o laço em portal.js, olhando a tela a cada rodada.
// -----------------------------------------------------------------------

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

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
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  // Reforço simples (execCommand) pros campos de login SSO — mais leve
  // que o CDP, e esses campos nunca deram o mesmo problema do Custcode.
  digitarDeVerdade(input, valor) {
    input.focus()
    input.select()
    const inseriu = document.execCommand('insertText', false, valor)
    if (!inseriu || input.value !== valor) {
      this.definirValorInput(input, valor)
    } else {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.dispatchEvent(new Event('blur', { bubbles: true }))
    }
  }

  async copiarParaAreaDeTransferencia(texto) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = texto
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const copiou = document.execCommand('copy')
      textarea.remove()
      return copiou
    }
  }

  // Confirmado ao vivo: colar de verdade (Ctrl+V) sempre funciona nos
  // campos desse Portal — digitação simulada por JS às vezes não. Copia
  // o valor pra área de transferência e pede pro background (via
  // chrome.debugger) selecionar tudo + colar de verdade — mesma técnica
  // usada tanto pro Custcode quanto pro campo de e-mail.
  async colarViaDebugger(input, valor) {
    const log = (...args) => console.log('[PortalParcelamento]', ...args)

    input.focus()
    await dormir(200)

    const copiou = await this.copiarParaAreaDeTransferencia(valor)
    log('copiou pra área de transferência?', copiou, '| valor:', JSON.stringify(valor))
    await dormir(150)

    // O pedido pro background pode ficar pendurado sem nunca responder
    // — corre contra um timeout pra nunca travar a automação esperando.
    let resposta
    try {
      resposta = await Promise.race([
        chrome.runtime.sendMessage({ tipo: 'pp:colarComDebugger' }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, erro: 'timeout' }), 9000)),
      ])
    } catch (err) {
      resposta = { ok: false, erro: err.message }
    }
    log('resposta do background:', JSON.stringify(resposta), '| valor do campo agora:', JSON.stringify(input.value))

    if (!resposta?.ok) {
      log('chrome.debugger não respondeu (' + (resposta?.erro || '?') + ') — usando reforço simples.')
      this.digitarDeVerdade(input, valor)
    }

    await dormir(300)
    const bateu = input.value === valor
    log('colou certo?', bateu, '| valor final:', JSON.stringify(input.value), '| esperado:', JSON.stringify(valor))
    return bateu
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
  // usado pras telas de login (USERNAME, TOKEN) e pro campo de
  // Destinatários do e-mail, que não têm id fixo conhecido.
  //
  // IMPORTANTE: quando dois campos ficam perto um do outro, subir níveis
  // demais a partir de UM input só pode achar um container-pai que
  // engloba os DOIS rótulos por engano. Por isso sobe nível por nível
  // testando TODOS os inputs em cada nível antes de subir mais um.
  acharCampoPorRotulo(rotulo) {
    const alvo = semAcento(rotulo)
    const inputs = [...document.querySelectorAll('input')]

    for (const input of inputs) {
      const atributos = semAcento(
        [input.placeholder, input.getAttribute('aria-label'), input.name, input.id].filter(Boolean).join(' ')
      )
      if (atributos.includes(alvo)) return input
    }

    for (let nivel = 0; nivel < 4; nivel++) {
      for (const input of inputs) {
        let container = input.closest('div, label, section, tr') || input.parentElement
        for (let i = 0; i < nivel && container; i++) container = container.parentElement
        if (container && semAcento(container.textContent || '').includes(alvo)) return input
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

  async preencherUsuarioEAvancar(etapa, usuario) {
    this.digitarDeVerdade(etapa.campo, usuario)
    await dormir(400)
    etapa.botao.click()
  }

  // Etapa 2 do login: USUÁRIO já vem preenchido pela etapa 1, só falta
  // o TOKEN do RSA SecurID.
  detectarTelaLoginToken() {
    const campo = this.acharCampoPorRotulo(this.selectors.loginTokenRotulo)
    const botao = this.acharBotaoPorTexto(this.selectors.loginBotaoEntrarTextos)
    return campo && botao ? { campo, botao } : null
  }

  async preencherTokenEEntrar(etapa, token) {
    this.digitarDeVerdade(etapa.campo, token)
    await dormir(400)
    etapa.botao.click()
  }

  // Acha o container (linha/bloco) da tela cujo texto contenha um trecho
  // dado — usado pra achar seções sem depender de id.
  acharContainerPorTexto(trecho, tags = ['tr', 'div', 'li', 'label']) {
    const alvo = semAcento(trecho)
    for (const tag of tags) {
      const candidatos = [...document.querySelectorAll(tag)]
      candidatos.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0))
      for (const el of candidatos) {
        if (semAcento(el.textContent || '').includes(alvo)) return el
      }
    }
    return null
  }

  // Tela "Selecione o Contexto que deseja acessar" (TIM / INTELIG).
  detectarTelaContexto() {
    const temTitulo = semAcento(this.textoDaTela()).includes(this.selectors.textoTelaContexto)
    if (!temTitulo) return null
    const botao = this.acharBotaoPorTexto([this.selectors.textoBotaoSelecionarContexto])
    return botao ? { botao } : null
  }

  // Match EXATO do rótulo — "TIM" tem só 3 letras, uma busca por
  // "contém" poderia confundir com o cabeçalho/logo da página.
  selecionarContextoTim() {
    const radios = [...document.querySelectorAll('input[type="radio"]')]
    for (const radio of radios) {
      const label = radio.closest('label') || radio.parentElement
      const texto = semAcento(label?.textContent || '').trim()
      if (texto === this.selectors.textoOpcaoContextoTim) {
        radio.click()
        return true
      }
    }
    return false
  }

  campoCustcode() {
    return document.querySelector(this.selectors.campoCustcodeSeletor)
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

  // Garante que o Motivo está em "Segunda Via de Conta" — confirmado ao
  // vivo que NEM SEMPRE vem assim por padrão (às vezes começa em
  // "Selecione"), então checa e só mexe se precisar.
  async garantirMotivo() {
    const combo = this.comboMotivo()
    if (!combo) return false
    const opcaoAtual = combo.options[combo.selectedIndex]
    if (opcaoAtual && semAcento(opcaoAtual.textContent).includes(this.selectors.motivoAlvoTexto)) return true

    const alvo = [...combo.options].find((o) => semAcento(o.textContent).includes(this.selectors.motivoAlvoTexto))
    if (!alvo) return false
    combo.value = alvo.value
    combo.dispatchEvent(new Event('change', { bubbles: true }))
    await dormir(300)
    return true
  }

  async preencherEBuscar(custcode) {
    await this.garantirMotivo()

    const campo = this.campoCustcode()
    let colouCerto = false
    for (let tentativa = 1; tentativa <= 3 && !colouCerto; tentativa++) {
      colouCerto = await this.colarViaDebugger(campo, custcode)
      if (!colouCerto) {
        console.log(`[PortalParcelamento] tentativa ${tentativa}/3: Custcode não bateu — campo ficou "${campo.value}", esperado "${custcode}". Tentando de novo.`)
      }
    }
    if (!colouCerto) return { ok: false, valorFinal: campo.value }

    await dormir(400)
    this.botaoBuscar().click()
    return { ok: true }
  }

  textoDaTela() {
    return document.body.innerText || ''
  }

  pareceSemFatura() {
    return this.selectors.padraoSemFatura.test(semAcento(this.textoDaTela()))
  }

  pareceErroValidacao() {
    return this.selectors.padraoErroValidacaoCustcode.test(semAcento(this.textoDaTela()))
  }

  // Lista as faturas em aberto encontradas na tela. Cada item tem uma
  // "chave" derivada do texto da própria linha (data/valor mostrados) —
  // NÃO um id de DOM — pra continuar identificando a mesma fatura mesmo
  // que a tela seja recarregada, e pra saber quais já foram processadas
  // quando o cliente tem mais de uma fatura em aberto.
  listarFaturas() {
    // Se não achar o container de "Faturas Em Aberto" de verdade, NÃO
    // cai pra procurar na página inteira — evita confundir com os
    // radios do próprio formulário de busca numa tela de erro.
    const container = this.acharContainerPorTexto(this.selectors.tituloFaturasEmAberto, ['div', 'table', 'section'])
    if (!container) return []
    const bolinhas = [...container.querySelectorAll('.ui-radiobutton-box, input[type="radio"]')]
    return bolinhas
      .map((el, i) => {
        const linha = el.closest('tr, li, div')
        const chave = semAcento(linha?.textContent || '').trim().slice(0, 120) || `fatura-${i}`
        return { elemento: el, linha, chave }
      })
      .filter((f) => f.chave)
  }

  proximaFaturaNaoProcessada(faturasProcessadas) {
    const faturas = this.listarFaturas()
    return faturas.find((f) => !faturasProcessadas.includes(f.chave)) || null
  }

  // Confere se uma bolinha PrimeFaces está de verdade marcada — olha o
  // <input type="radio"> real escondido dentro do componente (mais
  // confiável do que depender de qual classe CSS o PrimeFaces usa pro
  // ícone marcado).
  radioEstaMarcada(linhaOuElemento) {
    const input = linhaOuElemento?.querySelector?.('input[type="radio"]')
    if (input) return input.checked
    const icone = linhaOuElemento?.querySelector?.('.ui-radiobutton-icon') || linhaOuElemento
    return Boolean(icone) && !icone.className.includes('ui-icon-blank')
  }

  // Clica na bolinha da fatura e CONFERE que marcou de verdade antes de
  // seguir (tenta de novo algumas vezes se não marcou de primeira).
  async selecionarFatura(fatura) {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if (this.radioEstaMarcada(fatura.linha || fatura.elemento)) return true
      fatura.elemento.click()
      await dormir(300)
    }
    return this.radioEstaMarcada(fatura.linha || fatura.elemento)
  }

  botaoConfirmarFatura() {
    return document.querySelector(this.selectors.botaoConfirmarFaturaSeletor)
  }

  clicarConfirmarFatura() {
    const botao = this.botaoConfirmarFatura()
    if (botao) { botao.click(); return true }
    return false
  }

  // Tela "Selecionar método de envio" — precisa ter as opções de envio
  // visíveis (identificada pelo título OU pela opção "EMAIL" existir).
  detectarTelaMetodoEnvio() {
    const temTitulo = semAcento(this.textoDaTela()).includes(this.selectors.textoTelaMetodoEnvio)
    const opcaoEmail = this.acharContainerPorTexto(this.selectors.textoOpcaoEmail, ['label', 'div', 'td'])
    return temTitulo || opcaoEmail ? true : false
  }

  // Seleciona a opção "EMAIL" (nunca Impressão Online nem SMS) e confere
  // que marcou de verdade.
  async selecionarEmail() {
    const container = this.acharContainerPorTexto(this.selectors.textoOpcaoEmail, ['label', 'div', 'td'])
    if (!container) return false
    const linha = container.closest('tr, li') || container
    const bolinha = linha.querySelector('.ui-radiobutton-box, input[type="radio"]')
    if (!bolinha) return false
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if (this.radioEstaMarcada(linha)) return true
      bolinha.click()
      await dormir(300)
    }
    return this.radioEstaMarcada(linha)
  }

  // Campo "Destinatários" — só existe DEPOIS de marcar EMAIL (aparece
  // via AJAX no mesmo formulário).
  campoDestinatarios() {
    return this.acharCampoPorRotulo(this.selectors.textoRotuloDestinatarios)
  }

  async preencherEmailDestinatario(email) {
    const campo = this.campoDestinatarios()
    if (!campo) return { ok: false }
    let colouCerto = false
    for (let tentativa = 1; tentativa <= 3 && !colouCerto; tentativa++) {
      colouCerto = await this.colarViaDebugger(campo, email)
    }
    return { ok: colouCerto, valorFinal: campo.value }
  }

  clicarConfirmarGenerico() {
    const botao = this.acharBotaoPorTexto(this.selectors.textosBotaoConfirmar)
    if (botao) { botao.click(); return true }
    return false
  }

  // Tela de conferência final — mostra os dados da fatura de novo junto
  // com "Destino do Email". Clicar em Confirmar aqui manda o e-mail de
  // verdade.
  detectarTelaConfirmacaoFinal() {
    return semAcento(this.textoDaTela()).includes(this.selectors.textoDestinoDoEmail)
  }

  // CONFIRMADO por print — depois de confirmar, aparece "Sucesso! E-mail
  // enviado com sucesso!" — essa é a confirmação de verdade de que o
  // e-mail foi enviado (não basta o clique ter "funcionado").
  pareceEmailEnviado() {
    return semAcento(this.textoDaTela()).includes(this.selectors.textoSucessoEnvio)
  }

  clicarFechar() {
    const botao = this.acharBotaoPorTexto([this.selectors.textoBotaoFechar])
    if (botao) { botao.click(); return true }
    return false
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PortalAutomation }
}
