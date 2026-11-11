const radiosAba = document.querySelectorAll('input[name="sistema"]')
const secaoAba = document.getElementById('secaoAba')
const status = document.getElementById('status')
const aviso = document.getElementById('aviso')

document.getElementById('versao').textContent = 'versão ' + chrome.runtime.getManifest().version

let tabId = null // só preenchido quando a aba ativa é do Easy Vendas

function marcar(radios, valor) {
  radios.forEach((r) => { r.checked = r.value === valor })
}

function sistemaPelaUrl(url) {
  if (url.includes('/negociacao/primeiravenda')) return '2'
  if (url.includes('/cliente/')) return '1'
  return ''
}

async function iniciar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url?.includes('portaleasyvendas.timbrasil.com.br')) {
    tabId = tab.id
  } else {
    secaoAba.style.display = 'none'
    aviso.textContent = 'Pra escolher o sistema da aba, abra o ícone numa aba do Easy Vendas.'
  }

  try {
    const resp = await chrome.runtime.sendMessage({ tipo: 'crivo:pegarSistemaDaAba', tabId })
    // Sem escolha ainda: mostra o que a aba está usando pelo endereço.
    marcar(radiosAba, resp?.aba ? String(resp.aba) : sistemaPelaUrl(tab?.url || ''))
  } catch (err) {
    aviso.textContent = 'Não consegui falar com a extensão (' + (err?.message || 'erro desconhecido') + '). Recarrega a extensão em chrome://extensions e abre o ícone de novo.'
  }
}

async function salvar(mensagem, textoOk) {
  status.textContent = ''
  aviso.textContent = ''
  try {
    await chrome.runtime.sendMessage(mensagem)
    status.textContent = textoOk
  } catch (err) {
    aviso.textContent = 'Não consegui salvar (' + (err?.message || 'erro desconhecido') + '). Recarrega a extensão em chrome://extensions.'
  }
}

radiosAba.forEach((r) => {
  r.addEventListener('change', () => {
    if (!r.checked || tabId == null) return
    salvar({ tipo: 'crivo:definirSistema', tabId, numero: Number(r.value) }, `Esta aba agora é o ${r.value}º sistema — ela vai recarregar sozinha.`)
  })
})

iniciar()
