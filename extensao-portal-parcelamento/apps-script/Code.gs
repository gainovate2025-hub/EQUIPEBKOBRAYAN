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
 * 5. Autoriza quando o Google pedir (é a sua própria conta acessando a
 *    sua própria planilha).
 * 6. Copia a "URL do app da Web" gerada e cola no popup da extensão, em
 *    "URL do Apps Script (Web App)".
 *
 * A extensão manda o link/ID da planilha e o nome da aba em TODA
 * chamada — por isso o mesmo deploy serve pra qualquer planilha que essa
 * conta Google tenha acesso, não precisa publicar de novo se trocar de
 * planilha (só troca no popup da extensão).
 *
 * Colunas esperadas na aba (por NOME do cabeçalho na linha 1, não
 * importa a ordem/letra): CUSTCODE, CLIENTE, TELEFONE, e uma coluna
 * "DATA DA FATURA" que você cria (fica em branco = ainda não processado;
 * "não tem fatura" ou a data = já processado).
 */

function doGet(e) {
  try {
    const acao = e.parameter.action
    const planilha = SpreadsheetApp.openById(e.parameter.sheetId)
    const aba = planilha.getSheetByName(e.parameter.aba)
    if (!aba) return jsonResposta({ erro: `Aba "${e.parameter.aba}" não encontrada` })

    if (acao === 'proximo') return jsonResposta(proximoPendente(aba))
    if (acao === 'marcar') return jsonResposta(marcarResultado(aba, e.parameter.linha, e.parameter.valor))

    return jsonResposta({ erro: 'action inválida' })
  } catch (err) {
    return jsonResposta({ erro: String(err) })
  }
}

function indicesColunas(aba) {
  const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
  const normalizado = cabecalho.map((c) => String(c).trim().toUpperCase())
  const achar = (nome) => normalizado.indexOf(nome) + 1 // 1-based; 0 se não achar
  return {
    custcode: achar('CUSTCODE'),
    cliente: achar('CLIENTE'),
    telefone: achar('TELEFONE'),
    dataFatura: achar('DATA DA FATURA'),
  }
}

function proximoPendente(aba) {
  const col = indicesColunas(aba)
  if (!col.custcode || !col.dataFatura) {
    return { erro: 'Faltam colunas CUSTCODE e/ou "DATA DA FATURA" na aba' }
  }

  const ultimaLinha = aba.getLastRow()
  if (ultimaLinha < 2) return {}

  const dados = aba.getRange(2, 1, ultimaLinha - 1, aba.getLastColumn()).getValues()
  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i]
    const custcode = linha[col.custcode - 1]
    const dataFatura = linha[col.dataFatura - 1]
    if (custcode && !dataFatura) {
      return {
        linha: i + 2,
        custcode: String(custcode),
        cliente: col.cliente ? String(linha[col.cliente - 1] || '') : '',
        telefone: col.telefone ? String(linha[col.telefone - 1] || '') : '',
      }
    }
  }
  return {}
}

function marcarResultado(aba, linha, valor) {
  const col = indicesColunas(aba)
  if (!col.dataFatura) return { erro: 'Falta a coluna "DATA DA FATURA" na aba' }
  aba.getRange(Number(linha), col.dataFatura).setValue(valor)
  return { ok: true }
}

function jsonResposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
