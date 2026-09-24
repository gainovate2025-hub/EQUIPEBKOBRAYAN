// portal-automation.js
// -----------------------------------------------------------------------
// Lógica da automação do Portal Parcelamento, separada dos seletores
// (portal-selectors.js) e da orquestração (portal.js) — mesmo princípio
// do projeto Crivo (veja easyvendas-automation.js): cada método aqui é
// uma ação curta sobre o estado ATUAL da tela. Quem decide o que fazer a
// seguir é o laço em portal.js, olhando a tela a cada rodada.
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

  // Alguns campos (visto na tela de login SSO da TIM) usam um framework
  // que ignora um valor colocado direto via JavaScript, mesmo disparando
  // os eventos input/change — só reage a uma digitação "de verdade".
  // execCommand('insertText') faz o navegador tratar como uma edição
  // real (dispara os mesmos eventos nativos de digitação), funcionando
  // com mais frameworks. Confere no final se realmente colou; se não,
  // cai pro método normal como reforço.
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

  // NOVA ESTRATÉGIA (depois de muitas tentativas com JS "na unha" que só
  // davam "Código do cliente inválido" de vez em quando): a partir de
  // agora, ZERO manipulação de valor por JavaScript nesse campo — nem
  // pra limpar, nem pra digitar. Tudo que acontece nesse campo é feito
  // pelo próprio Chrome via CDP (chrome.debugger): selecionar tudo
  // (Ctrl+A de verdade) e colar (Ctrl+V de verdade) — exatamente as duas
  // ações que o Brayan faz na mão e que sempre funcionam. Nenhum JS toca
  // no .value do campo em momento nenhum.
  async digitarViaDebugger(input, valor) {
    const log = (...args) => console.log('[PortalParcelamento]', ...args)

    input.focus()
    await dormir(200)

    const copiou = await this.copiarParaAreaDeTransferencia(valor)
    log('copiou pra área de transferência?', copiou, '| valor:', JSON.stringify(valor))
    await dormir(150)

    // Confirmado ao vivo: o pedido pro background (chrome.debugger) pode
    // ficar pendurado sem NUNCA responder nem dar erro — e sem um limite
    // de tempo aqui, isso travava a automação inteira esperando pra
    // sempre. Corre contra um timeout: se não responder rápido, desiste
    // do debugger e cai pro reforço mais simples em vez de travar.
    log('mandando pedido de selecionar tudo + colar pro background...')
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
      log('depois do reforço simples, valor do campo:', JSON.stringify(input.value))
    }

    await dormir(300)
    const bateu = input.value === valor
    log('digitou certo?', bateu, '| valor final:', JSON.stringify(input.value), '| esperado:', JSON.stringify(valor))
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
  // usado pras telas de login (USERNAME, TOKEN), que não têm id fixo
  // conhecido.
  //
  // IMPORTANTE: quando dois campos ficam perto um do outro (ex: USUÁRIO
  // e TOKEN na mesma tela), subir níveis demais a partir de UM input só
  // pode achar um container-pai que engloba os DOIS rótulos — aí "token"
  // bateria no campo de usuário por engano. Por isso sobe nível por
  // nível testando TODOS os inputs em cada nível antes de subir mais um
  // — assim o container mais PRÓXIMO de algum input sempre ganha de um
  // container genérico compartilhado entre vários campos.
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
        let container = input.closest('div, label, section') || input.parentElement
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

  // Espera um pouco entre preencher e clicar — a tela usa um framework
  // (React/Angular) que reage aos eventos de forma assíncrona; clicar
  // logo em seguida pode disparar antes dela "perceber" que o campo foi
  // preenchido, e a validação acha o campo vazio.
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

  // Tela "Selecione o Contexto que deseja acessar" (TIM / INTELIG),
  // aparece logo depois do login, antes da tela de busca.
  detectarTelaContexto() {
    const temTitulo = semAcento(this.textoDaTela()).includes(this.selectors.textoTelaContexto)
    if (!temTitulo) return null
    const botao = this.acharBotaoPorTexto([this.selectors.textoBotaoSelecionarContexto])
    return botao ? { botao } : null
  }

  // Match EXATO do rótulo (não só "contém") — "TIM" tem só 3 letras,
  // então uma busca por "contém" poderia confundir com o nome "TIM" no
  // cabeçalho/logo da página, que não é um rótulo de opção de verdade.
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

  // NOVA ESTRATÉGIA: em toda tela que já vimos, a bolinha "Buscar por
  // código do cliente (Custcode)" e o Motivo "Segunda Via de Conta" já
  // vêm selecionados sozinhos, por padrão — não precisa (e não deve)
  // mexer neles. Cada clique/seleção extra dispara uma consulta AJAX a
  // mais nesse formulário JSF/PrimeFaces, e several dessas rodando perto
  // uma da outra é o tipo de coisa que corrompe o ViewState e causa
  // erro/travamento sem motivo aparente. Só mexe no que realmente
  // precisa: o campo do Custcode e o botão Buscar.
  //
  // O Custcode NUNCA pode ir incompleto pro Buscar (ex: sem o "7."
  // inicial) — em vez de só avisar e clicar assim mesmo, tenta de novo
  // (até algumas vezes) até o campo bater EXATAMENTE com o valor da
  // planilha antes de buscar.
  async preencherEBuscar(custcode) {
    const campo = this.campoCustcode()
    let digitouCerto = false
    for (let tentativa = 1; tentativa <= 3 && !digitouCerto; tentativa++) {
      digitouCerto = await this.digitarViaDebugger(campo, custcode)
      if (!digitouCerto) {
        console.log(`[PortalParcelamento] tentativa ${tentativa}/3: valor não bateu — campo ficou "${campo.value}", esperado "${custcode}". Tentando de novo.`)
      }
    }
    if (!digitouCerto) return { ok: false, valorFinal: campo.value }

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

  // Lista as faturas em aberto encontradas na tela. Cada item tem um
  // "chave" derivado do texto da própria linha (data/valor mostrados) —
  // NÃO um id de DOM — pra continuar identificando a mesma fatura mesmo
  // que a tela seja recarregada, e pra saber quais já foram processadas
  // quando o cliente tem mais de uma fatura em aberto.
  listarFaturas() {
    // Se não achar o container de "Faturas Em Aberto" de verdade, NÃO
    // cai pra procurar na página inteira — já vimos isso confundir com
    // os radios do próprio formulário de busca (Custcode/CPF/Instalação)
    // numa tela de erro, fingindo achar uma "fatura" que não existe.
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
  // <input type="radio"> real escondido dentro do componente (o jeito
  // mais confiável, não depende de qual classe CSS o PrimeFaces usa pra
  // desenhar o ícone marcado) e cai pra checar a classe do ícone
  // (ui-icon-blank = não marcada) só se não achar o input real.
  radioEstaMarcada(linhaOuElemento) {
    const input = linhaOuElemento?.querySelector?.('input[type="radio"]')
    if (input) return input.checked
    const icone = linhaOuElemento?.querySelector?.('.ui-radiobutton-icon') || linhaOuElemento
    return Boolean(icone) && !icone.className.includes('ui-icon-blank')
  }

  // Clica na bolinha da fatura e CONFERE que marcou de verdade antes de
  // seguir (tenta de novo algumas vezes se não marcou de primeira) — sem
  // isso corríamos o risco de clicar em "Confirmar" com nenhuma fatura
  // selecionada de verdade.
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

  // Opção "IMPRESSÃO ONLINE" — acha o container com esse texto, clica na
  // bolinha de rádio de dentro dele e CONFERE que marcou de verdade
  // antes de seguir (mesma lógica de selecionarFatura).
  async selecionarImpressaoOnline() {
    const container = this.acharContainerPorTexto(this.selectors.textoImpressaoOnline)
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
