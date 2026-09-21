// portal-selectors.js
// -----------------------------------------------------------------------
// ÚNICO lugar com os textos/seletores usados pra achar coisas na tela do
// Portal Parcelamento. Se alguma coisa mudar na tela, ajusta só aqui.
//
// IMPORTANTE — o que está CONFIRMADO vs. o que é MELHOR ESFORÇO:
// Os seletores marcados "CONFIRMADO" vêm exatamente do HTML que o Brayan
// mandou. Os marcados "MELHOR ESFORÇO" eu não vi o HTML real (telas de
// lista de faturas, impressão online, tela de confirmação final) — usei
// busca por texto (igual o projeto Crivo faz) pra ter uma chance de
// funcionar mesmo sem o id exato, mas é bem provável que precise de um
// teste ao vivo pra ajustar, exatamente como aconteceu no Crivo (veja o
// histórico de commits de lá). Se travar em algum desses passos, copia o
// HTML da tela (botão direito > Inspecionar) e manda pra ajustar aqui.
// -----------------------------------------------------------------------

const PORTAL_SELECTORS = {
  // CONFIRMADO — campo de texto pra digitar o Custcode.
  campoCustcodeSeletor: '[id="form1:codcliGSM"]',

  // CONFIRMADO — bolinha (radio) de "Buscar por código do cliente
  // (Custcode)". Já vem marcada por padrão na tela, mas clicamos mesmo
  // assim pra garantir.
  radioCustcodeSeletor: '[id="form1:opt1GSM"] .ui-radiobutton-box',

  // CONFIRMADO — combo "Motivo". É um <select> normal escondido dentro
  // do componente visual da PrimeFaces — dá pra setar o valor direto nele
  // e disparar o onchange (que já chama o PrimeFaces.ab sozinho).
  comboMotivoSeletor: '[id="form1:motivoGSM_input"]',
  // Texto da opção que precisa ficar selecionada.
  motivoAlvoTexto: 'segunda via',

  // CONFIRMADO — botão "Buscar" (dispara a busca da fatura pelo Custcode).
  botaoBuscarSeletor: '[id="form1:btBuscarGSM"]',

  // MELHOR ESFORÇO — mensagem de "não tem fatura em aberto" (texto real
  // pode variar — ex: "Não foram encontradas faturas em aberto para este
  // cliente"). Ajusta o regex se o texto real for diferente.
  padraoSemFatura: /nao\s+(foram\s+encontrad\w*|ha|existe\w*)\s+fatur\w*|nenhuma\s+fatur\w*\s+em\s+aberto/,

  // MELHOR ESFORÇO — título da seção "Faturas Em Aberto", usado só pra
  // achar o container certo na tela e listar as bolinhas de fatura de
  // dentro dele (evita pegar bolinha de outra parte da tela por engano).
  tituloFaturasEmAberto: 'faturas em aberto',

  // CONFIRMADO — botão "Confirmar" (primeiro, depois de escolher a
  // fatura na lista).
  botaoConfirmarFaturaSeletor: '[id="form1:btBuscar1"]',

  // MELHOR ESFORÇO — texto da opção "IMPRESSÃO ONLINE" (é outra bolinha
  // de rádio, sem id confirmado). Busca por container com esse texto.
  textoImpressaoOnline: 'impressao online',

  // MELHOR ESFORÇO — botões "Confirmar" genéricos (usado pro 2º e 3º
  // "Confirmar" do fluxo — depois de Impressão Online, e na tela
  // seguinte). Aceita variações de caixa/acento.
  textosBotaoConfirmar: ['confirmar'],

  // Tela final com o PDF da fatura — o Chrome abre o PDF usando o
  // visualizador nativo dele. Em vez de tentar clicar no botão de baixar
  // do visualizador (fica num contexto separado, de outra extensão,
  // difícil/inseguro de automatizar), a extensão detecta que a ABA
  // navegou pra uma URL de PDF e busca o PDF direto por fetch (usa os
  // mesmos cookies da sessão, já que roda na mesma aba/origem).
  pareceUrlDePdf(url) {
    return /\.pdf(\?|$)/i.test(url) || url.includes('/download') || url.includes('boleto')
  },
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PORTAL_SELECTORS }
}
