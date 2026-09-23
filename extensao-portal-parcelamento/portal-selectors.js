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
  // CONFIRMADO por print — tela "Selecione o Contexto que deseja
  // acessar" (TIM / INTELIG), aparece logo depois do login, ANTES da
  // tela de busca por Custcode. TIM já vem marcado por padrão, mas
  // clica mesmo assim pra garantir, igual o Custcode.
  textoTelaContexto: 'selecione o contexto',
  textoOpcaoContextoTim: 'tim',
  textoBotaoSelecionarContexto: 'selecionar',

  // CONFIRMADO por print — depois de escolher TIM, cai numa tela "Home"
  // ("Seja bem-vindo ao Portal SGR da TIM!") que não é nem a tela de
  // contexto nem a de busca — precisa navegar direto pra essa URL fixa
  // da tela de busca (mesmo truque do background.js pro PORTAL_URL: não
  // dá pra confiar em clicar num menu, mais simples ir direto na URL).
  urlTelaBusca: 'https://portalparcelamento.timbrasil.com.br/pparcelamentos/appSgr/gerarConsultar/filtroPesquisa.xhtml',

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

  // CONFIRMADO por print — "Código do cliente inválido. Por favor,
  // informe apenas números e pontos." Vista quando o clique em Buscar
  // dispara antes do campo terminar de "colar" (já corrigido com um
  // delay), mas serve de rede de segurança: se aparecer mesmo assim,
  // reporta como erro de verdade em vez de confundir com "sem fatura"
  // ou com uma fatura inventada.
  padraoErroValidacaoCustcode: /codigo do cliente invalido/,

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

  // LOGIN — confirmado por print do Brayan. É um login único (SSO) em 2
  // etapas, ANTES de chegar em qualquer tela do Portal em si:
  //   Etapa 1 ("Sign On", estilo Okta): só um campo USERNAME (em inglês)
  //   + botão "Next" — aqui entra a matrícula (ex: T3786035).
  //   Etapa 2 (tela com a marca TIM): USUÁRIO já vem preenchido sozinho
  //   pela etapa 1, só falta o TOKEN (código de 6 dígitos de um chaveiro
  //   físico RSA SecurID, muda a cada ~60s) + botão "Entrar".
  // Não tem como guardar usuário/senha fixos pra esse login — por isso a
  // extensão lê da tabela parcelamento_login (Supabase), onde a pessoa
  // cola a matrícula + o código do token na hora, pelo site.
  loginUsuarioRotulo: 'username',
  loginBotaoAvancarTextos: ['next', 'avancar'],
  loginTokenRotulo: 'token',
  loginBotaoEntrarTextos: ['entrar'],

  // Um login colado no site só vale por pouco tempo (o token do RSA
  // muda toda hora) — depois disso a extensão ignora e fica esperando
  // um novo em vez de tentar entrar com um código já vencido.
  loginMaxIdadeMs: 90000,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PORTAL_SELECTORS }
}
