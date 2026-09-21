// mensagens.js
// -----------------------------------------------------------------------
// ÚNICO lugar com o texto das mensagens mandadas pro cliente no WhatsApp.
// Se quiser mudar o texto, mexe só aqui — não precisa procurar no resto
// do código. {CLIENTE} é trocado pelo nome da coluna CLIENTE da planilha.
// -----------------------------------------------------------------------

const MENSAGENS = {
  // Mandada ANTES de anexar o PDF da fatura.
  aviso: (cliente) =>
    `Olá${cliente ? ', ' + cliente : ''}! Tudo bem? Identificamos que você possui uma fatura em aberto. Segue em anexo a 2ª via para pagamento.`,

  // Mandada DEPOIS de enviar o PDF — a "cobrança".
  cobranca: (cliente) =>
    `Por favor, efetue o pagamento o quanto antes para evitar juros e possível bloqueio da linha. Qualquer dúvida, estamos à disposição.`,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MENSAGENS }
}
