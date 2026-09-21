// whatsapp-selectors.js
// -----------------------------------------------------------------------
// ÚNICO lugar com os seletores usados no WhatsApp Web. O WhatsApp muda o
// HTML com frequência e usa ids gerados aleatoriamente (tipo "_r_1ak_")
// que NÃO servem de seletor — por isso aqui só usamos atributos estáveis
// (aria-label, data-icon, data-testid) e busca por texto, nunca id.
//
// MELHOR ESFORÇO: não tenho como testar ao vivo contra a versão atual do
// WhatsApp Web — se algum passo não funcionar, abre o DevTools (F12),
// inspeciona o elemento e ajusta o seletor correspondente aqui.
// -----------------------------------------------------------------------

const WHATSAPP_SELECTORS = {
  // Caixa de digitar mensagem (rodapé do chat aberto).
  caixaMensagemSeletor: 'div[contenteditable="true"][aria-label="Digite uma mensagem"], div[contenteditable="true"][data-tab="10"]',

  // Botão "+" de anexar, ao lado da caixa de mensagem.
  botaoAnexarSeletor: '[data-icon="plus-rounded"], [data-icon="clip"]',
  botaoAnexarTextos: ['anexar'],

  // Item "Documento" no menu que abre depois de clicar em anexar.
  itemDocumentoTextos: ['documento'],

  // Botão "Enviar" na tela de pré-visualização do arquivo anexado.
  botaoEnviarAnexoTextos: ['enviar'],

  // Mensagem que o WhatsApp mostra quando o número da URL
  // (send?phone=...) é inválido ou não tem WhatsApp.
  padraoNumeroInvalido: /numero de telefone.*invalido|phone number shared via url is invalid|invalido/i,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WHATSAPP_SELECTORS }
}
