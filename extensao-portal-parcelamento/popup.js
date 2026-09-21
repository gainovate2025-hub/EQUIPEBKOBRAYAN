const campoWebAppUrl = document.getElementById('webAppUrl')
const campoSheetId = document.getElementById('sheetId')
const campoAbaNome = document.getElementById('abaNome')
const botaoSalvar = document.getElementById('salvar')
const botaoToggle = document.getElementById('toggle')
const status = document.getElementById('status')

function extrairSheetId(valor) {
  const match = valor.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : valor.trim()
}

function atualizarBotaoToggle(ligado) {
  botaoToggle.textContent = ligado ? 'Desligar' : 'Ligar'
  botaoToggle.className = ligado ? 'ligado' : 'desligado'
}

async function carregar() {
  const resp = await chrome.runtime.sendMessage({ tipo: 'pp:status' })
  const config = resp?.config || {}
  campoWebAppUrl.value = config.webAppUrl || ''
  campoSheetId.value = config.sheetId || ''
  campoAbaNome.value = config.abaNome || 'Custo Code'
  atualizarBotaoToggle(Boolean(config.ligado))

  if (resp?.job?.ativo) {
    status.textContent = `Processando agora: ${resp.job.custcode} (${resp.job.cliente || 'sem nome'})`
  } else if (config.ligado) {
    status.textContent = 'Ligado — procurando próximo cliente pendente...'
  } else {
    status.textContent = 'Desligado.'
  }
}

botaoSalvar.addEventListener('click', async () => {
  const config = {
    webAppUrl: campoWebAppUrl.value.trim(),
    sheetId: extrairSheetId(campoSheetId.value),
    abaNome: campoAbaNome.value.trim() || 'Custo Code',
  }
  await chrome.runtime.sendMessage({ tipo: 'pp:configurar', config })
  status.textContent = 'Configuração salva.'
})

botaoToggle.addEventListener('click', async () => {
  const ligadoAgora = botaoToggle.textContent === 'Desligar'
  await chrome.runtime.sendMessage({ tipo: ligadoAgora ? 'pp:desligar' : 'pp:ligar' })
  await carregar()
})

carregar()
