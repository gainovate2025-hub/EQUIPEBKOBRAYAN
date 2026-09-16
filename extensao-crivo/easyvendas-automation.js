// easyvendas-automation.js
// -----------------------------------------------------------------------
// Lógica da automação, separada dos seletores (easyvendas-selectors.js) e
// da orquestração (easyvendas.js) — mesmo princípio do projeto P2B
// (veja P2BAutomation.js): nunca uma função só "clica e fica esperando".
// Cada método aqui é uma ação curta sobre o estado ATUAL da tela. Quem
// decide o que fazer a seguir é o laço em easyvendas.js, chamando
// detectarEstado() a cada rodada — exatamente como uma pessoa faria:
// olha a tela agora, entende o que tem ali, só depois age.
// -----------------------------------------------------------------------

function semAcento(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

class EasyVendasAutomation {
  constructor(selectors) {
    this.selectors = selectors
  }

  // Acha o campo de CNPJ de dois jeitos, porque a tela "Adicionar Clientes"
  // (2º sistema) não tem o rótulo dentro do mesmo <div> do campo — só um
  // container de 1 nível acima (como testava antes) nunca achava nada ali,
  // mesmo com "CNPJ *" bem visível do lado do campo (confirmado com o
  // diagnóstico: botão certo apareceu na lista, mas o campo nunca batia).
  acharCampoCnpj() {
    const alvo = this.selectors.campoCnpjContainerTexto
    const inputs = [...document.querySelectorAll('input')]
    for (const input of inputs) {
      // 1) atributos do próprio campo (placeholder/aria-label/name/id) —
      // pega o caso de rótulo flutuante feito via placeholder, sem texto
      // de verdade em nenhum elemento ao redor.
      const atributos = semAcento(
        [input.placeholder, input.getAttribute('aria-label'), input.name, input.id].filter(Boolean).join(' ')
      )
      if (atributos.includes(alvo)) return input

      // 2) sobe até 4 níveis na árvore (não só o pai direto) atrás de
      // "CNPJ" em algum texto ali perto — cobre rótulo que fica alguns
      // níveis acima do campo, com outros elementos (ícone de busca etc.)
      // no meio.
      let container = input.parentElement
      for (let nivel = 0; container && nivel < 4; nivel++, container = container.parentElement) {
        if (semAcento(container.textContent || '').includes(alvo)) return input
      }
    }
    return null
  }

  // Acha um botão cujo texto CONTENHA um dos alvos (sem acento/maiúscula).
  // Não exige igualdade exata porque o botão às vezes tem um ícone junto
  // que entra no texto — fica com o elemento de texto MAIS CURTO entre os
  // que batem, pra não pegar um contêiner grande por cima do botão.
  acharBotaoPorTexto(alvos) {
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

  listarBotoesVisiveis(limite = 20) {
    return [...document.querySelectorAll('button, [role="button"], a')]
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, limite)
  }

  definirValorInput(input, valor) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  formatarCnpj(digitos) {
    return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }

  // Acha a mensagem da janela de resultado SE ela estiver aberta agora —
  // sem esperar nada, sem precisar de um "antes/depois". Ignora o rótulo
  // permanente "Pré-Análise de Crédito -  Não solicitada" que fica na
  // tela o tempo todo (ele também contém o texto do título, mas sempre
  // vem seguido da palavra "solicitada" bem perto).
  lerModalSeAberto() {
    const linhas = (document.body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
    const alvo = this.selectors.modalTituloTexto
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]
      const normalizada = semAcento(linha)
      const posicao = normalizada.indexOf(alvo)
      if (posicao === -1) continue
      if (normalizada.includes(this.selectors.modalRotuloPermanenteTexto)) continue
      // um ícone (ex: "info"/"warning") pode grudar sem espaço antes do
      // título — aceita um prefixo curto, não uma frase inteira antes.
      if (posicao > 10) continue

      const restoMesmaLinha = linha.slice(posicao + alvo.length).trim().replace(/^[-–—:]+\s*/, '')
      if (restoMesmaLinha.length > 5 && semAcento(restoMesmaLinha) !== 'ok') return restoMesmaLinha

      const seguintes = linhas.slice(i + 1).filter((l) => semAcento(l) !== 'ok')
      if (seguintes.length > 0) return seguintes.join(' ').trim()
    }
    return null
  }

  // Descreve a tela ATUAL sem clicar em nada. Chamado a cada rodada do
  // laço em easyvendas.js — é o "olhar pra tela" antes de decidir agir.
  detectarEstado() {
    const mensagemModal = this.lerModalSeAberto()
    if (mensagemModal) return { tipo: 'modal', mensagem: mensagemModal }

    const campoCnpj = this.acharCampoCnpj()
    const botaoAvancar = this.acharBotaoPorTexto(this.selectors.botaoAvancarTextos)
    if (campoCnpj && botaoAvancar) return { tipo: 'formulario', campoCnpj, botaoAvancar }

    return {
      tipo: 'desconhecido',
      url: location.href,
      botoesVisiveis: this.listarBotoesVisiveis(),
    }
  }

  // Preenche o CNPJ e clica AVANÇAR. Ação que PODE navegar a tela — por
  // isso não fica esperando resposta aqui dentro; quem confirma o que
  // aconteceu é a próxima rodada do laço, chamando detectarEstado() de
  // novo (pode virar 'modal', continuar 'formulario', ou virar
  // 'desconhecido' se a tela realmente foi pra outro lugar).
  preencherEAvancar(estadoFormulario, cnpjDigitos) {
    this.definirValorInput(estadoFormulario.campoCnpj, '')
    this.definirValorInput(estadoFormulario.campoCnpj, this.formatarCnpj(cnpjDigitos))
    estadoFormulario.botaoAvancar.click()
  }

  ehNaoEncontrado(mensagem) {
    return this.selectors.padraoNaoEncontrado.test(semAcento(mensagem))
  }

  classificarModal(mensagem) {
    const normalizado = semAcento(mensagem)
    if (this.selectors.padraoReprovado.test(normalizado)) return 'reprovado'
    if (this.selectors.padraoAprovado.test(normalizado)) return 'aprovado'
    const reprovadoFallback = this.selectors.padraoReprovadoFallback.some((re) => re.test(normalizado))
    return reprovadoFallback ? 'reprovado' : 'aprovado'
  }

  fecharModal() {
    const botaoOk = this.acharBotaoPorTexto(this.selectors.botaoOkTextos)
    if (botaoOk) botaoOk.click()
    return Boolean(botaoOk)
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EasyVendasAutomation }
}
