/**
 * Portal Parcelamento — ponte entre a extensão e a planilha Google Sheets.
 *
 * COMO PUBLICAR (faz uma vez só):
 * 1. Abre a planilha no navegador.
 * 2. Menu Extensões > Apps Script.
 * 3. Apaga o conteúdo padrão e cola este arquivo inteiro.
 * 4. Menu Implantar > Nova implantação.
 *    - Tipo: "Aplicativo da Web".
 *    - Executar como: "Eu" (sua conta).
 *    - Quem tem acesso: "Qualquer pessoa" (precisa ser "Qualquer pessoa",
 *      não "Qualquer pessoa com uma Conta Google" — senão a extensão não
 *      consegue chamar sem fazer login).
 * 5. Autoriza quando o Google pedir.
 * 6. Copia a "URL do app da Web" gerada e cola no site do BKO, em
 *    Automações > Portal Parcelamento.
 *
 * Os nomes das colunas (Custcode, E-mail, Telefone, Status) vêm da
 * extensão em TODA chamada (configurados no site) — não precisa editar
 * este arquivo se o cabeçalho da planilha mudar de nome.
 */

function doGet(e) {
  try {
    const acao = e.parameter.action
    const planilha = SpreadsheetApp.openById(e.parameter.sheetId)
    const aba = planilha.getSheetByName(e.parameter.aba)
    if (!aba) return jsonResposta({ erro: `Aba "${e.parameter.aba}" não encontrada` })

    const colunas = {
      custcode: e.parameter.colCustcode || 'CUSTCODE',
      email: e.parameter.colEmail || 'EMAIL',
      telefone: e.parameter.colTelefone || 'TELEFONE',
      status: e.parameter.colStatus || 'DATA DA FATURA',
    }

    if (acao === 'proximo') return jsonResposta(proximoPendente(aba, colunas))
    if (acao === 'marcar') return jsonResposta(marcarResultado(aba, colunas, e.parameter.linha, e.parameter.valor))

    return jsonResposta({ erro: 'action inválida' })
  } catch (err) {
    return jsonResposta({ erro: String(err) })
  }
}

function indicesColunas(aba, colunas) {
  const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
  const normalizado = cabecalho.map((c) => String(c).trim().toUpperCase())
  const achar = (nome) => normalizado.indexOf(String(nome).trim().toUpperCase()) + 1 // 1-based; 0 se não achar
  return {
    custcode: achar(colunas.custcode),
    email: achar(colunas.email),
    telefone: achar(colunas.telefone),
    status: achar(colunas.status),
  }
}

// Um cliente é "pendente" quando tem Custcode preenchido e a coluna de
// status ainda está vazia (nunca foi processado).
function proximoPendente(aba, colunas) {
  const col = indicesColunas(aba, colunas)
  if (!col.custcode) return { erro: `Coluna "${colunas.custcode}" não encontrada na aba selecionada.` }
  if (!col.status) return { erro: `Coluna "${colunas.status}" não encontrada na aba selecionada.` }

  const ultimaLinha = aba.getLastRow()
  if (ultimaLinha < 2) return {}

  const dados = aba.getRange(2, 1, ultimaLinha - 1, aba.getLastColumn()).getValues()
  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i]
    const custcode = linha[col.custcode - 1]
    const status = linha[col.status - 1]
    if (custcode && !status) {
      return {
        linha: i + 2,
        custcode: String(custcode),
        email: col.email ? String(linha[col.email - 1] || '') : '',
        telefone: col.telefone ? String(linha[col.telefone - 1] || '') : '',
      }
    }
  }
  return {}
}

function marcarResultado(aba, colunas, linha, valor) {
  const col = indicesColunas(aba, colunas)
  if (!col.status) return { erro: `Coluna "${colunas.status}" não encontrada na aba selecionada.` }
  aba.getRange(Number(linha), col.status).setValue(valor)
  return { ok: true }
}

function jsonResposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
