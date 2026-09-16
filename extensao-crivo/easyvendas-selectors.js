// easyvendas-selectors.js
// -----------------------------------------------------------------------
// ÚNICO lugar com os textos/seletores usados pra achar coisas na tela do
// Easy Vendas. Se alguma coisa mudar na tela (texto de botão, mensagem,
// etc.), ajusta só aqui — não precisa mexer no resto do código.
//
// IMPORTANTE: diferente do projeto P2B (onde os seletores foram
// capturados AO VIVO navegando no sistema de verdade — veja
// p2b-selectors.js), aqui ainda são baseados em prints/vídeo que o
// Brayan mandou, não confirmados ao vivo ainda. Isso é o que a gente
// termina de confirmar testando juntos.
// -----------------------------------------------------------------------

const EASYVENDAS_SELECTORS = {
  // Acha o campo de CNPJ pelo texto do rótulo/contêiner ao redor do input.
  campoCnpjContainerTexto: 'cnpj',

  // Botão que dispara a Análise de Crédito. É "AVANÇAR" — o botão
  // "CRÉDITO" sozinho não faz nada (confirmado ao vivo pelo Brayan).
  botaoAvancarTextos: ['avancar'],

  // Botão(ões) que fecham a janela de resultado.
  botaoOkTextos: ['ok', 'fechar'],

  // Título da janela de resultado. A tela normal de "Dados do cliente"
  // também mostra um rótulo parecido o tempo todo ("Pré-Análise de
  // Crédito -  Não solicitada") — por isso NÃO basta achar esse texto
  // em qualquer lugar da tela, veja a lógica de exclusão em
  // easyvendas-automation.js > lerModalSeAberto().
  modalTituloTexto: 'analise de credito',
  modalRotuloPermanenteTexto: 'solicitada',

  // Classificação da mensagem dentro da janela.
  // A mensagem real já vista é "Não foi encontrada nenhuma empresa com o
  // CNPJ: ..." — por isso "nao (foi )?encontrad", não só "nao encontrad".
  padraoNaoEncontrado: /nao solicitada|nao (foi )?encontrad|nenhuma empresa/,
  padraoReprovado: /nao recomendado|nao aprovado/,
  padraoAprovado: /recomendado|aprovado/,
  // Fallback (formato antigo, caso apareça alguma variação diferente).
  padraoReprovadoFallback: [/\btim\b/, /duvidas? financeiras?/, /restric/, /cheque sem fundo/],
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EASYVENDAS_SELECTORS }
}
