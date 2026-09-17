// easyvendas-selectors.js
// -----------------------------------------------------------------------
// ÚNICO lugar com os textos/seletores usados pra achar coisas na tela do
// Easy Vendas. Se alguma coisa mudar na tela (texto de botão, mensagem,
// etc.), ajusta só aqui — não precisa mexer no resto do código.
//
// Confirmado ao vivo pelo Brayan (não é mais só baseado em print/vídeo):
// o campo de CNPJ é `input[name="cnpj"]` nos dois sistemas, e as regras de
// aprovado/reprovado abaixo são as palavras exatas que cada sistema usa.
// -----------------------------------------------------------------------

const EASYVENDAS_SELECTORS = {
  // Seletor direto do campo de CNPJ — confirmado no HTML real da tela:
  // <input md-cnpj-input mask="99.999.999/9999-99" name="cnpj" ...>
  campoCnpjSeletor: 'input[name="cnpj"]',
  // Fallback (se o nome do campo mudar num dos sistemas): procura pelo
  // texto "cnpj" no rótulo/contêiner ao redor do input.
  campoCnpjContainerTexto: 'cnpj',

  // Botão que dispara a consulta. No sistema 1 (tela de Cliente) é
  // "SOLICITAR"; no sistema 2 (Negociação > 1ª Venda) é "AVANÇAR" — a
  // extensão aceita qualquer um dos dois, tanto faz em qual sistema tá.
  botaoAvancarTextos: ['avancar', 'solicitar'],

  // Lupa de busca ao lado do campo de CNPJ — só usada no sistema 1
  // ("Adicionar Clientes"): antes de "Solicitar" a Pré-Análise, parece que
  // precisa buscar/carregar os dados da empresa primeiro (senão o
  // Solicitar reclama que não achou nada, mesmo com CNPJ válido). É um
  // ícone de fonte (Material Icons), por isso o texto dele é literalmente
  // a palavra do ícone.
  botaoBuscarTextos: ['search', 'buscar', 'pesquisar'],

  // Botão(ões) que fecham uma janela de resultado deixada aberta de uma
  // consulta anterior, antes de começar uma nova.
  botaoOkTextos: ['ok', 'fechar'],

  // CNPJ não encontrado (mensagem já vista: "Não foi encontrada nenhuma
  // empresa com o CNPJ: ..."). Exige "cnpj" perto de "não encontrad" (ou a
  // frase inteira "nenhuma empresa") — só "não encontrado" sozinho é
  // genérico demais (pode ser de CEP, endereço etc., nada a ver com CNPJ).
  padraoNaoEncontrado: /nenhuma empresa|cnpj[\s\S]{0,30}nao encontrad|nao encontrad[\s\S]{0,30}cnpj/,

  // Sistema 1 (Cliente): só é REPROVADO se a mensagem citar "Tim" (ex.:
  // "Constam dúvidas financeiras com o grupo TIM"). Qualquer outra
  // mensagem de resultado é APROVADO — regra confirmada pelo Brayan.
  sistema1PadraoReprovado: /\btim\b/,

  // Sistema 2 (Negociação > 1ª Venda): é REPROVADO se a mensagem citar
  // qualquer uma dessas palavras. Qualquer outra coisa é APROVADO —
  // regra confirmada pelo Brayan.
  sistema2PadraoReprovado: /retaguarda|negado|inadimplente/,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EASYVENDAS_SELECTORS }
}
