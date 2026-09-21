// whatsapp-automation.js
// -----------------------------------------------------------------------
// Ações de automação do WhatsApp Web, separadas da orquestração
// (whatsapp.js) — mesmo princípio dos outros dois arquivos de automação
// deste projeto.
// -----------------------------------------------------------------------

function semAcentoWA(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

class WhatsappAutomation {
  constructor(selectors) {
    this.selectors = selectors
  }

  acharBotaoDentro(container, alvos) {
    const normalizados = alvos.map((a) => semAcentoWA(a).trim())
    const elementos = [...container.querySelectorAll('button, [role="button"], span, div')]
    let melhor = null
    for (const el of elementos) {
      const texto = semAcentoWA(`${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.title || ''}`).trim()
      if (!texto || texto.length > 40) continue
      const bate = normalizados.some((alvo) => texto === alvo || texto.includes(alvo))
      if (!bate) continue
      if (!melhor || texto.length < melhor.texto.length) melhor = { el, texto }
    }
    return melhor?.el || null
  }

  acharBotaoPorTexto(alvos) {
    return this.acharBotaoDentro(document, alvos)
  }

  caixaMensagem() {
    return document.querySelector(this.selectors.caixaMensagemSeletor)
  }

  numeroPareceInvalido() {
    return this.selectors.padraoNumeroInvalido.test(document.body.innerText || '')
  }

  // Digita texto numa caixa contenteditable de um jeito que o editor do
  // WhatsApp reconhece como digitação de verdade (dispara os eventos que
  // atualizam o estado interno dele) — truque padrão usado em automações
  // desse tipo: focar o campo e usar execCommand('insertText').
  async digitarTexto(caixa, texto) {
    caixa.focus()
    document.execCommand('insertText', false, texto)
    await new Promise((r) => setTimeout(r, 150))
  }

  enviarComEnter(caixa) {
    caixa.focus()
    const evento = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
    caixa.dispatchEvent(evento)
  }

  clicarAnexar() {
    const porIcone = document.querySelector(this.selectors.botaoAnexarSeletor)
    if (porIcone) { (porIcone.closest('button, [role="button"]') || porIcone).click(); return true }
    const porTexto = this.acharBotaoPorTexto(this.selectors.botaoAnexarTextos)
    if (porTexto) { porTexto.click(); return true }
    return false
  }

  clicarOpcaoDocumento() {
    const item = this.acharBotaoPorTexto(this.selectors.itemDocumentoTextos)
    if (item) { item.click(); return true }
    return false
  }

  // Acha o <input type="file"> certo pra anexar documento (não o de
  // foto/vídeo, que tem accept="image/*,video/*") e injeta o arquivo nele
  // via DataTransfer — funciona sem abrir o seletor de arquivo do sistema
  // operacional, porque `input.files` pode ser setado por script.
  injetarArquivo(base64, nomeArquivo, mimeType = 'application/pdf') {
    const inputs = [...document.querySelectorAll('input[type="file"]')]
    const alvo = inputs.reverse().find((i) => !(i.accept || '').includes('image')) || inputs[0]
    if (!alvo) return false

    const bytes = atob(base64)
    const array = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i)
    const arquivo = new File([array], nomeArquivo, { type: mimeType })

    const dt = new DataTransfer()
    dt.items.add(arquivo)
    alvo.files = dt.files
    alvo.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  clicarEnviarAnexo() {
    const botao = this.acharBotaoPorTexto(this.selectors.botaoEnviarAnexoTextos)
    if (botao) { botao.click(); return true }
    return false
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WhatsappAutomation }
}
