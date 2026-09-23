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

  // Depois de MUITAS tentativas de fazer o robô digitar sozinho o Custcode
  // com truques de JavaScript (execCommand, re-tentativa, conferência), o
  // campo continuava comendo caractere, ou o excesso de tentativas em
  // sequência chegou a derrubar a sessão do Portal ("session expired").
  // Confirmado ao vivo: quando a PESSOA digita na mão, sempre funciona de
  // primeira — o problema nunca foi o valor em si, é o campo não
  // "acreditar" numa digitação simulada por JS puro.
  //
  // Solução: pede pro background.js (via chrome.debugger, permissão nova
  // no manifest) inserir o texto usando o protocolo de depuração do
  // Chrome — o mesmo mecanismo que ferramentas como Puppeteer usam pra
  // digitar "de verdade" em qualquer campo, sem precisar de clique da
  // pessoa (só aparece uma faixa amarela do Chrome por um instante).
  async digitarViaDebugger(input, valor) {
    input.focus()
    await dormir(150)

    // limpa o campo antes por JS simples — o problema era só com o valor
    // FINAL não sendo reconhecido, apagar não tem esse problema.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await dormir(150)

    let resposta
    try {
      resposta = await chrome.runtime.sendMessage({ tipo: 'pp:digitarComDebugger', texto: valor })
    } catch (err) {
      resposta = { ok: false, erro: err.message }
    }

    if (!resposta?.ok) {
      // debugger indisponível (ex: DevTools já aberto nessa aba) — cai
      // pro reforço mais simples que já tínhamos, como último recurso.
      this.digitarDeVerdade(input, valor)
    }

    await dormir(300)
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    return input.value === valor
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

  // Espera um pouco entre preencher o campo e clicar Buscar — sem isso,
  // já vimos o clique disparar antes do JSF/PrimeFaces "perceber" que o
  // campo foi preenchido, e a validação do servidor recusa como se o
  // campo estivesse vazio ("Código do cliente inválido").
  async preencherEBuscar(custcode) {
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

    // Confirmado ao vivo: o Custcode da planilha vem com um prefixo
    // "7." na frente (ex: "7.2232569") que NÃO faz parte do código de
    // verdade nesse campo — testando manualmente sem esse prefixo
    // funcionou normal. Tira só esse "7." do início antes de digitar.
    const custcodeFormatado = custcode.replace(/^7\./, '')

    const campo = this.campoCustcode()
    const digitouCerto = await this.digitarViaDebugger(campo, custcodeFormatado)
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
