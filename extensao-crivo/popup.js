const radios = document.querySelectorAll('input[name="sistema"]')
const status = document.getElementById('status')
const aviso = document.getElementById('aviso')
const opcoes = document.getElementById('opcoes')

let tabId = null

async function iniciar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.url?.includes('portaleasyvendas.timbrasil.com.br')) {
    opcoes.style.display = 'none'
    aviso.textContent = 'Abre uma aba do Easy Vendas primeiro — a escolha vale só pra essa aba.'
    return
  }

  tabId = tab.id

  // Sempre marca "1º sistema" primeiro, pra nunca ficar sem nenhuma opção
  // marcada — se der erro pra falar com a extensão, pelo menos mostra um
  // valor (e o aviso abaixo explica o que fazer).
  radios.forEach((r) => { r.checked = r.value === '1' })

  try {
    const resp = await chrome.runtime.sendMessage({ tipo: 'crivo:pegarSistemaDaAba', tabId })
    const atual = resp?.numero === 2 ? '2' : '1'
    radios.forEach((r) => { r.checked = r.value === atual })
  } catch (err) {
    aviso.textContent = 'Não consegui falar com a extensão (' + (err?.message || 'erro desconhecido') + '). Recarrega a extensão em chrome://extensions e abre o ícone de novo.'
  }
}

radios.forEach((r) => {
  r.addEventListener('change', async () => {
    if (!r.checked || tabId == null) return
    status.textContent = ''
    aviso.textContent = ''
    try {
      await chrome.runtime.sendMessage({ tipo: 'crivo:definirSistema', tabId, numero: Number(r.value) })
      status.textContent = 'Salvo pra essa aba — ela vai recarregar sozinha.'
    } catch (err) {
      aviso.textContent = 'Não consegui salvar (' + (err?.message || 'erro desconhecido') + '). Recarrega a extensão em chrome://extensions.'
    }
  })
})

iniciar()
