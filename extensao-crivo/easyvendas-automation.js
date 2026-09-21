// easyvendas-automation.js
// -----------------------------------------------------------------------
// Lógica da automação, separada dos seletores (easyvendas-selectors.js) e
// da orquestração (easyvendas.js) — mesmo princípio do projeto P2B (veja
// P2BAutomation.js): nunca uma função só "clica e fica esperando". Cada
// método aqui é uma ação curta sobre o estado ATUAL da tela. Quem decide
// o que fazer a seguir é o laço em easyvendas.js, chamando detectarEstado()
// a cada rodada — exatamente como uma pessoa faria: olha a tela agora,
// entende o que tem ali, só depois age.
//
// Como a extensão sabe se apareceu uma mensagem de resultado: em vez de
// procurar um título/modal específico (que muda de tela pra tela e já deu
// bug — veja o histórico de commits), ela tira uma "foto" do texto da tela
// ANTES de clicar, e depois de clicar compara com o texto ATUAL: qualquer
// linha nova que aparecer é candidata a mensagem de resultado. Isso evita
// confundir com texto que já tava lá antes (tipo "TIM, líder em cobertura"
// no rodapé) e funciona em qualquer sistema, não importa o layout.
// -----------------------------------------------------------------------

function semAcento(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function linhasDoBody() {
  return (document.body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
}

class EasyVendasAutomation {
  constructor(selectors) {
    this.selectors = selectors
  }

  acharCampoCnpj() {
    const porSeletor = document.querySelector(this.selectors.campoCnpjSeletor)
    if (porSeletor) return porSeletor

    // Fallback: procura pelo texto "cnpj" no rótulo/contêiner ao redor do
    // input, subindo até 4 níveis na árvore (cobre rótulo que fica alguns
    // níveis acima do campo, com outros elementos no meio).
    const alvo = this.selectors.campoCnpjContainerTexto
    const inputs = [...document.querySelectorAll('input')]
    for (const input of inputs) {
      const atributos = semAcento(
        [input.placeholder, input.getAttribute('aria-label'), input.name, input.id].filter(Boolean).join(' ')
      )
      if (atributos.includes(alvo)) return input

      let container = input.parentElement
      for (let nivel = 0; container && nivel < 4; nivel++, container = container.parentElement) {
        if (semAcento(container.textContent || '').includes(alvo)) return input
      }
    }
    return null
  }

  // Acha, dentro de um container qualquer (pode ser o document inteiro),
  // um botão cujo texto OU aria-label CONTENHA um dos alvos (sem acento/
  // maiúscula) — alguns botões (ex: "Clientes" no menu) não têm texto
  // visível, só aria-label. Não exige igualdade exata porque o botão às
  // vezes tem um ícone junto que entra no texto — fica com o elemento de
  // texto MAIS CURTO entre os que batem, pra não pegar um contêiner
  // grande por cima do botão.
  acharBotaoDentro(container, alvos) {
    const normalizados = alvos.map((a) => semAcento(a).trim())
    const elementos = [...container.querySelectorAll('button, [role="button"], a')]
    let melhor = null
    for (const el of elementos) {
      const texto = semAcento(`${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`).trim()
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

  // Mesma busca de botão, mas só perto de um campo (sobe até 6 níveis na
  // árvore) — usado quando tem MAIS de um botão igual na tela (ex: duas
  // lupas de busca, uma do CNPJ e outra do CEP) e precisa achar a certa.
  acharBotaoPertoDe(elemento, alvos) {
    let container = elemento.parentElement
    for (let nivel = 0; container && nivel < 6; nivel++, container = container.parentElement) {
      const achado = this.acharBotaoDentro(container, alvos)
      if (achado) return achado
    }
    return null
  }

  listarBotoesVisiveis(limite = 20) {
    return [...document.querySelectorAll('button, [role="button"], a')]
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, limite)
  }

  // Campos do formulário que o Angular marca como inválidos agora —
  // ajuda a explicar quando um clique em "Solicitar"/"Avançar" não faz
  // nada visível (pode ser o formulário bloqueado por um campo
  // obrigatório vazio, tipo Contato/Telefone, que a busca de CNPJ não
  // preenche sozinha).
  camposInvalidosVisiveis(limite = 10) {
    return [...document.querySelectorAll('.ng-invalid, [aria-invalid="true"]')]
      .filter((el) => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')
      .map((el) => {
        const container = el.closest('div, label, section')
        const rotulo = container?.querySelector('label')?.textContent?.trim()
        return rotulo || el.getAttribute('aria-label') || el.name || el.id || el.tagName
      })
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

  // Foto do texto da tela agora — guarda antes de clicar, pra comparar
  // depois e achar só o que é NOVO (veja textoNovoDesde).
  tirarFotoTexto() {
    return new Set(linhasDoBody())
  }

  // Linhas que estão na tela AGORA mas não estavam na foto tirada antes.
  // Ignora linhas que são só "CNPJ: ..." — isso aparece na tela ANTES do
  // resultado de verdade (a empresa carregando), nunca é o resultado em
  // si, e já vimos ele fazer a extensão "travar" achando que já tinha
  // terminado (leu só isso e classificou errado como aprovado).
  textoNovoDesde(fotoAntes) {
    return linhasDoBody()
      .filter((l) => !fotoAntes.has(l))
      .filter((l) => !/^cnpj:?\s*[\d.\-/]+$/i.test(l.trim()))
      .join(' ')
      .trim()
  }

  // Descreve a tela ATUAL sem clicar em nada. Chamado a cada rodada do
  // laço em easyvendas.js — é o "olhar pra tela" antes de decidir agir.
  detectarEstado() {
    const campoCnpj = this.acharCampoCnpj()
    const botaoAvancar = this.acharBotaoPorTexto(this.selectors.botaoAvancarTextos)
    if (campoCnpj && botaoAvancar) return { tipo: 'formulario', campoCnpj, botaoAvancar }

    return {
      tipo: 'desconhecido',
      url: location.href,
      botoesVisiveis: this.listarBotoesVisiveis(),
    }
  }

  // Só digita o CNPJ, sem clicar em nada — usado quando o clique é um
  // passo separado (veja acharBotaoBuscar, pro sistema 1).
  digitarCnpj(campoCnpj, cnpjDigitos) {
    this.definirValorInput(campoCnpj, '')
    this.definirValorInput(campoCnpj, this.formatarCnpj(cnpjDigitos))
  }

  // Preenche o CNPJ e clica no botão de consultar, num passo só — usado
  // quando não tem uma busca separada antes (sistema 2). Ação que PODE
  // navegar a tela — por isso não fica esperando resposta aqui dentro;
  // quem confirma o que aconteceu é a próxima rodada do laço, comparando
  // o texto da tela com a foto tirada antes (veja textoNovoDesde).
  preencherEAvancar(estadoFormulario, cnpjDigitos) {
    this.digitarCnpj(estadoFormulario.campoCnpj, cnpjDigitos)
    estadoFormulario.botaoAvancar.click()
  }

  // Lupa de busca ao lado do CNPJ (só sistema 1) — busca/carrega os dados
  // da empresa antes do Solicitar. Devolve null se não achar (aí segue
  // direto pro botão de consultar, como antes).
  acharBotaoBuscar() {
    return this.acharBotaoPorTexto(this.selectors.botaoBuscarTextos)
  }

  // Campo de CEP (só existe na tela "Adicionar Clientes", sistema 1) —
  // confirmado no HTML real: <input name="cep" md-cep-input ...>.
  acharCampoCep() {
    return document.querySelector(this.selectors.campoCepSeletor)
  }

  // Lupa de busca do CEP — tem o MESMO texto ("search") da lupa do CNPJ,
  // por isso busca perto do próprio campo de CEP, não em qualquer lugar
  // da tela (senão podia clicar a lupa errada).
  acharBotaoBuscarCep(campoCep) {
    return this.acharBotaoPertoDe(campoCep, this.selectors.botaoBuscarTextos)
  }

  // Volta pra tela de "Adicionar Clientes" clicando Clientes > Adicionar
  // — usado quando a extensão recarrega a página e cai numa tela
  // diferente (não direto no formulário com o campo CNPJ). Devolve true
  // se clicou em algum dos dois (a próxima rodada do laço confere se já
  // chegou no formulário).
  navegarParaAdicionarClientes() {
    const botaoAdicionar = this.acharBotaoPorTexto(this.selectors.botaoAdicionarTextos)
    if (botaoAdicionar) {
      botaoAdicionar.click()
      return true
    }
    const botaoClientes = this.acharBotaoPorTexto(this.selectors.botaoClientesTextos)
    if (botaoClientes) {
      botaoClientes.click()
      return true
    }
    return false
  }

  // Tela de Contrato (Termo de Contratação / Contrato de Permanência) —
  // detecta pelo texto do cabeçalho/abas. A extensão NUNCA clica em nada
  // aqui (nem Salvar, nem Enviar por e-mail, nem Cancelar) — só serve pra
  // saber que caiu nela sem querer e precisa voltar (veja
  // voltarUmaPagina), sem tentar ler nem decidir nada nessa tela.
  pareceTelaDeContrato() {
    return this.selectors.padraoTelaContrato.test(semAcento(document.body.innerText || ''))
  }

  // Volta uma página no histórico do navegador — igual clicar no botão
  // "voltar" — usado quando cai na tela de Contrato sem querer, pra
  // voltar pra tela anterior e esperar a mensagem de resultado de
  // verdade aparecer ali.
  voltarUmaPagina() {
    history.back()
  }

  ehNaoEncontrado(mensagem) {
    return this.selectors.padraoNaoEncontrado.test(semAcento(mensagem))
  }

  // Empresa aberta há menos de 6 meses — frase direta, ou "aberta/
  // constituída/fundada há N meses" com N < 6 (número checado em código).
  empresaMuitoRecente(normalizado) {
    if (this.selectors.padraoEmpresaRecenteDireto.test(normalizado)) return true
    const m = normalizado.match(this.selectors.padraoEmpresaRecenteComNumero)
    return m ? Number(m[2]) < 6 : false
  }

  // numeroSistema decide qual regra de reprovação vale (são diferentes em
  // cada sistema — veja easyvendas-selectors.js):
  // - sistema 1 (Crivo 1, interno TIM): só reprova com dívida Tim, cheque
  //   sem fundo ou empresa recém-aberta. Restrição de CNPJ/sócio sozinha
  //   NÃO reprova aqui.
  // - sistema 2 (Crivo 2, crivo de mercado — pesa mais): reprova com
  //   retaguarda/negado/inadimplente OU restrição de mercado.
  // Fora isso, é aprovado.
  classificarMensagem(mensagem, numeroSistema) {
    const normalizado = semAcento(mensagem)

    if (numeroSistema === 1) {
      const reprovado =
        this.selectors.sistema1PadraoReprovado.test(normalizado) ||
        this.selectors.padraoChequeSemFundo.test(normalizado) ||
        this.empresaMuitoRecente(normalizado)
      return reprovado ? 'reprovado' : 'aprovado'
    }

    const reprovado =
      this.selectors.sistema2PadraoReprovado.test(normalizado) ||
      this.selectors.padraoRestricaoMercado.test(normalizado)
    return reprovado ? 'reprovado' : 'aprovado'
  }

  // Fecha uma janela de resultado deixada aberta de uma consulta anterior
  // (limpeza antes de começar uma nova) — não faz nada se não achar.
  fecharModal() {
    const botaoOk = this.acharBotaoPorTexto(this.selectors.botaoOkTextos)
    if (botaoOk) botaoOk.click()
    return Boolean(botaoOk)
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EasyVendasAutomation }
}
