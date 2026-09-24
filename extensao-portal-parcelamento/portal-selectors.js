// portal-selectors.js
// -----------------------------------------------------------------------
// ÚNICO lugar com os textos/seletores usados pra achar coisas na tela do
// Portal Parcelamento. Reconstruído do zero a partir de prints reais
// mandados pelo Brayan (fluxo completo: busca → fatura → e-mail →
// confirmação final). Tudo marcado CONFIRMADO veio de print/HTML real;
// MELHOR ESFORÇO é busca por texto (mais tolerante a mudança de tela).
// -----------------------------------------------------------------------

const PORTAL_SELECTORS = {
  // CONFIRMADO — tela "Selecione o Contexto" (TIM/INTELIG), aparece
  // logo depois do login, antes da tela de busca.
  textoTelaContexto: 'selecione o contexto',
  textoOpcaoContextoTim: 'tim',
  textoBotaoSelecionarContexto: 'selecionar',

  // CONFIRMADO — depois de escolher TIM, pode cair numa tela "Home" que
  // não é nem contexto nem busca — nesse caso navega direto pra essa URL
  // fixa da tela de busca.
  urlTelaBusca: 'https://portalparcelamento.timbrasil.com.br/pparcelamentos/appSgr/gerarConsultar/filtroPesquisa.xhtml',

  // CONFIRMADO — campo de texto do Custcode. Formato sempre com o "7."
  // na frente (é parte de verdade do código, não é prefixo pra tirar) —
  // ex: "7.2232803".
  campoCustcodeSeletor: '[id="form1:codcliGSM"]',

  // CONFIRMADO — combo "Motivo". NEM SEMPRE vem preenchido sozinho —
  // pode começar em "Selecione" e precisa ser trocado pra "Segunda Via
  // de Conta" antes de buscar.
  comboMotivoSeletor: '[id="form1:motivoGSM_input"]',
  motivoAlvoTexto: 'segunda via',

  // CONFIRMADO — botão "Buscar".
  botaoBuscarSeletor: '[id="form1:btBuscarGSM"]',

  // CONFIRMADO por print — "Código do cliente inválido. Por favor,
  // informe apenas números e pontos." Só aparece se algo saiu errado no
  // preenchimento do Custcode.
  padraoErroValidacaoCustcode: /codigo do cliente invalido/,

  // MELHOR ESFORÇO — mensagem de "não tem fatura em aberto".
  padraoSemFatura: /nao\s+(foram\s+encontrad\w*|ha|existe\w*)\s+fatur\w*|nenhuma\s+fatur\w*\s+em\s+aberto/,

  // CONFIRMADO por print — título da seção com a lista de faturas em
  // aberto pra escolher (cada uma com uma bolinha de rádio).
  tituloFaturasEmAberto: 'faturas em aberto',

  // CONFIRMADO por print — botão "Confirmar" logo abaixo da lista de
  // faturas (primeira confirmação, depois de marcar a bolinha).
  botaoConfirmarFaturaSeletor: '[id="form1:btBuscar1"]',

  // CONFIRMADO por print — tela "Selecionar método de envio", com 3
  // bolinhas: IMPRESSÃO ONLINE / SMS / EMAIL. A gente sempre escolhe
  // EMAIL (nunca as outras duas).
  textoTelaMetodoEnvio: 'selecionar metodo de envio',
  textoOpcaoEmail: 'email',

  // CONFIRMADO por print — depois de marcar EMAIL, aparece (via AJAX, no
  // mesmo formulário) um campo "Destinatários" pra colar o e-mail.
  textoRotuloDestinatarios: 'destinatarios',

  // Botões "Confirmar" genéricos — usados duas vezes: uma depois de
  // digitar o e-mail (leva pra tela de conferência final, com os dados
  // da fatura + "Destino do Email"), e outra na tela de conferência
  // final (essa é a que manda o e-mail de verdade). Aceita variações de
  // caixa/acento.
  textosBotaoConfirmar: ['confirmar'],

  // CONFIRMADO por print — título da tela de conferência final, mostra
  // os dados da fatura de novo junto com o e-mail de destino.
  textoDestinoDoEmail: 'destino do email',

  // CONFIRMADO por print — depois de confirmar na tela de conferência
  // final, aparece um aviso "Sucesso! E-mail enviado com sucesso!" e a
  // tela vira "Confirme os dados do recibo" com um botão Fechar. Essa
  // mensagem é a confirmação de verdade de que o e-mail foi enviado —
  // só marca a planilha depois de ver ela.
  textoSucessoEnvio: 'email enviado com sucesso',
  textoBotaoFechar: 'fechar',

  // LOGIN — SSO em 2 etapas (Okta-style username → RSA SecurID token).
  // A extensão lê usuário/token colados no site (Automações > Portal
  // Parcelamento), nunca guarda senha fixa.
  loginUsuarioRotulo: 'username',
  loginBotaoAvancarTextos: ['next', 'avancar'],
  loginTokenRotulo: 'token',
  loginBotaoEntrarTextos: ['entrar'],
  loginMaxIdadeMs: 90000,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PORTAL_SELECTORS }
}
