const botaoToggle = document.getElementById('toggle')
const status = document.getElementById('status')
const erro = document.getElementById('erro')

function atualizarBotaoToggle(ligado) {
  botaoToggle.textContent = ligado ? 'Desligar' : 'Ligar'
  botaoToggle.className = ligado ? 'ligado' : 'desligado'
}

async function carregar() {
  const resp = await chrome.runtime.sendMessage({ tipo: 'pp:status' })
  atualizarBotaoToggle(Boolean(resp?.ligado))

  erro.textContent = resp?.erroConfig ? `Erro ao buscar configuração: ${resp.erroConfig}` : ''

  if (resp?.job?.ativo) {
    status.textContent = `Processando agora: ${resp.job.custcode} (${resp.job.cliente || 'sem nome'})\nE-mail: ${resp.job.email || 'sem e-mail na planilha'}`
  } else if (!resp?.config) {
    status.textContent = 'Nenhuma planilha configurada ainda — peça pro supervisor configurar no site (Automações > Portal Parcelamento).'
  } else if (resp?.ligado) {
    status.textContent = 'Ligado — procurando próximo cliente pendente...'
  } else {
    status.textContent = 'Desligado.'
  }
}

botaoToggle.addEventListener('click', async () => {
  const ligadoAgora = botaoToggle.textContent === 'Desligar'
  await chrome.runtime.sendMessage({ tipo: ligadoAgora ? 'pp:desligar' : 'pp:ligar' })
  await carregar()
})

carregar()
