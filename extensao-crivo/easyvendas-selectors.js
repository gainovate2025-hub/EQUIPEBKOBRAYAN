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
  // consulta anterior, antes de começar uma nova. "Não" cobre a janela de
  // "Deseja realizar a reanálise de crédito?" (some após um NEGADO) — a
  // extensão nunca deve aceitar reanálise/redução de comissionamento
  // sozinha, só fecha e mantém o resultado que já leu.
  botaoOkTextos: ['ok', 'fechar', 'nao'],

  // CNPJ não encontrado (mensagem já vista: "Não foi encontrada nenhuma
  // empresa com o CNPJ: ..."). Exige "cnpj" perto de "não encontrad" (ou a
  // frase inteira "nenhuma empresa") — só "não encontrado" sozinho é
  // genérico demais (pode ser de CEP, endereço etc., nada a ver com CNPJ).
  padraoNaoEncontrado: /nenhuma empresa|cnpj[\s\S]{0,30}nao encontrad|nao encontrad[\s\S]{0,30}cnpj/,

  // Restrição (de qualquer tipo — de mercado, ou "para empresa e sócios",
  // etc.) — SÓ vale no 2º sistema (Crivo 2, que é o crivo de mercado).
  // Mensagem real já vista: "Cliente MEI com restrição para empresa e
  // sócios" (sem citar "mercado" no texto) — por isso não exige a
  // palavra "mercado" perto, só "restri" em qualquer forma. No 1º
  // sistema (Crivo 1, interno TIM) restrição de CNPJ/sócio NÃO reprova
  // sozinha — confirmado pelo Brayan.
  padraoRestricaoMercado: /restri\w*/,

  // Empresa recém-aberta: frase direta, ou "aberta/constituída/fundada há
  // N meses" com N menor que 6 (checado em código, não só regex — veja
  // classificarMensagem em easyvendas-automation.js).
  padraoEmpresaRecenteDireto: /menos de (6|seis) meses/,
  padraoEmpresaRecenteComNumero: /(abert\w*|constitu\w*|fundad\w*)[^\d]{0,20}(\d+)\s*mes/,

  padraoChequeSemFundo: /cheque sem fundo/,

  // Sistema 1 (Cliente — Crivo 1, INTERNO TIM): é REPROVADO só nesses 3
  // casos — dívida com a Tim, cheque sem fundo, ou empresa aberta há
  // menos de 6 meses. Qualquer outra coisa (inclusive CNPJ ou sócio com
  // restrição) é APROVADO — regra confirmada pelo Brayan.
  sistema1PadraoReprovado: /\btim\b/,

  // Sistema 2 (Negociação > 1ª Venda — Crivo 2, CRIVO DE MERCADO, pesa
  // mais que o 1º): é REPROVADO se a mensagem citar qualquer uma dessas
  // palavras, ou "restrição de mercado". Qualquer outra coisa é
  // APROVADO — regra confirmada pelo Brayan.
  sistema2PadraoReprovado: /retaguarda|negado|inadimplente/,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EASYVENDAS_SELECTORS }
}
