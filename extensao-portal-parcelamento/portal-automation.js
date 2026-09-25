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

// Pausa com tempo aleatório entre min e max — pessoa de verdade nunca
// clica com o mesmo intervalo exato toda vez.
function pausaHumana(min = 400, max = 1100) {
  return dormir(min + Math.random() * (max - min))
}

function semAcento(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Jeitos de colocar um valor num campo do Portal, do mais parecido com
// uma pessoa colando ao mais "técnico". O campo do Custcode/e-mail só
// aceita bem valor que entra por evento REAL de teclado/colar do
// navegador (via chrome.debugger no background.js) — mas qual dos jeitos
// o Portal aceita de verdade varia, então tenta um, CONFERE se o valor
// entrou, e passa pro próximo se não entrou.
const MODOS_PREENCHIMENTO = ['colar', 'teclas', 'inserir']

class PortalAutomation {
  constructor(selectors, logger) {
    this.selectors = selectors
    this.log = logger || ((...args) => console.log('[PortalParcelamento]', ...args))
  }

  definirValorInput(input, valor) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  // Reforço simples (execCommand) — usado nos campos de login SSO (nunca
  // deram o problema do Custcode) e como ÚLTIMO recurso se nenhum modo
  // do chrome.debugger funcionar.
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
    } catch (err) {
      this.log('clipboard.writeText falhou:', err.message, '— tentando execCommand("copy")')
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

  // Tenta UM modo de preenchimento e confere o resultado no campo.
  // Loga também o foco (se o documento/campo estava com foco na hora) —
  // é a primeira coisa a checar quando o valor não entra.
  async preencherCampoComModo(input, valor, modo) {
    input.focus()
    await pausaHumana(150, 350)

    if (modo === 'colar') {
      const copiou = await this.copiarParaAreaDeTransferencia(valor)
      this.log(`[${modo}] copiou pra área de transferência?`, copiou)
      await dormir(150)
    }

    let resposta
    try {
      resposta = await Promise.race([
        chrome.runtime.sendMessage({ tipo: 'pp:cdpDigitar', modo, texto: valor }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, erro: 'timeout esperando o background' }), 30000)),
      ])
    } catch (err) {
      resposta = { ok: false, erro: err.message }
    }

    await dormir(350)
    const bateu = input.value === valor
    this.log(
      `[${modo}] resposta do background:`, JSON.stringify(resposta),
      '| campo:', JSON.stringify(input.value),
      '| esperado:', JSON.stringify(valor),
      '| bateu?', bateu,
      '| campo com foco?', document.activeElement === input,
      '| documento com foco?', document.hasFocus()
    )
    return { ok: bateu, valorFinal: input.value }
  }

  // Tenta os modos em ordem (começando pelo que já funcionou antes, se
  // souber), até um deles fazer o valor entrar certinho no campo.
  async preencherComFallback(input, valor, modoInicial = 0) {
    for (let i = 0; i < MODOS_PREENCHIMENTO.length; i++) {
      const modo = MODOS_PREENCHIMENTO[(modoInicial + i) % MODOS_PREENCHIMENTO.length]
      const r = await this.preencherCampoComModo(input, valor, modo)
      if (r.ok) return { ok: true, modo, valorFinal: r.valorFinal }
      this.log(`Modo "${modo}" não fez o valor entrar — tentando o próximo.`)
      await pausaHumana(400, 800)
    }

    this.digitarDeVerdade(input, valor)
    await dormir(300)
    const ok = input.value === valor
    this.log('[execCommand] último recurso — bateu?', ok, '| campo:', JSON.stringify(input.value))
    return { ok, modo: ok ? 'execCommand' : null, valorFinal: input.value }
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
  // Sobe nível por nível testando TODOS os inputs em cada nível antes de
  // subir mais um — assim o container mais PRÓXIMO de algum input sempre
  // ganha de um container genérico compartilhado entre vários campos.
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
    await pausaHumana(500, 1000)
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
    await pausaHumana(500, 1000)
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

  // Texto que o combo Motivo mostra na tela agora (o rótulo visível do
  // componente PrimeFaces, não o <select> escondido) — pra log.
  textoMotivoVisivel() {
    const rotulo = document.querySelector('[id="form1:motivoGSM_label"]')
    return rotulo ? (rotulo.textContent || '').trim() : '(rótulo não achado)'
  }

  // Garante que o Motivo está em "Segunda Via de Conta" — confirmado ao
  // vivo que NEM SEMPRE vem assim por padrão (às vezes começa em
  // "Selecione"), então checa e só mexe se precisar.
  async garantirMotivo() {
    const combo = this.comboMotivo()
    if (!combo) {
      this.log('Motivo: combo não encontrado na tela')
      return false
    }
    const opcaoAtual = combo.options[combo.selectedIndex]
    this.log('Motivo antes — select:', opcaoAtual?.textContent?.trim(), '| visível:', this.textoMotivoVisivel())
    if (opcaoAtual && semAcento(opcaoAtual.textContent).includes(this.selectors.motivoAlvoTexto)) return true

    const alvo = [...combo.options].find((o) => semAcento(o.textContent).includes(this.selectors.motivoAlvoTexto))
    if (!alvo) return false
    combo.value = alvo.value
    combo.dispatchEvent(new Event('change', { bubbles: true }))
    await dormir(500)
    this.log('Motivo depois — visível:', this.textoMotivoVisivel())
    return true
  }

  // O Custcode NUNCA pode ir incompleto pro Buscar (ex: sem o "7."
  // inicial) — só clica Buscar depois de confirmar que o campo tem
  // EXATAMENTE o valor da planilha.
  async preencherEBuscar(custcode, modoInicial = 0) {
    await this.garantirMotivo()

    const campo = this.campoCustcode()
    const r = await this.preencherComFallback(campo, custcode, modoInicial)
    if (!r.ok) return r

    await pausaHumana(900, 1600)
    this.botaoBuscar().click()
    return r
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
      await dormir(400)
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
      await dormir(400)
    }
    return this.radioEstaMarcada(linha)
  }

  // Campo "Destinatários" — só existe DEPOIS de marcar EMAIL (aparece
  // via AJAX no mesmo formulário).
  campoDestinatarios() {
    return this.acharCampoPorRotulo(this.selectors.textoRotuloDestinatarios)
  }

  async preencherEmailDestinatario(email, modoInicial = 0) {
    const campo = this.campoDestinatarios()
    if (!campo) return { ok: false, valorFinal: '' }
    return this.preencherComFallback(campo, email, modoInicial)
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
