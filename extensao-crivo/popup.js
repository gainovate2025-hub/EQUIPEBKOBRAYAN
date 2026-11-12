const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

const radiosPc = document.querySelectorAll('input[name="pc"]')
const radiosAba = document.querySelectorAll('input[name="sistema"]')
const secaoAba = document.getElementById('secaoAba')
const status = document.getElementById('status')
const aviso = document.getElementById('aviso')
const resumo = document.getElementById('resumo')

document.getElementById('versao').textContent = 'versão ' + chrome.runtime.getManifest().version

let tabId = null // só preenchido quando a aba ativa é do Easy Vendas
let pcAtual = null

function marcar(radios, valor) {
  radios.forEach((r) => { r.checked = r.value === valor })
}

function sistemaPelaUrl(url) {
  if (url.includes('/negociacao/primeiravenda')) return '2'
  if (url.includes('/cliente/')) return '1'
  return ''
}

// Mostra se os dois sistemas deste PC estão dando sinal pro banco.
async function atualizarConexao() {
  if (!pcAtual) {
    resumo.textContent = 'Escolha o número deste PC acima.'
    resumo.style.color = '#b42318'
    return
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/crivo_status_pcs`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) throw new Error('banco respondeu ' + res.status)
    const linhas = (await res.json()).filter((l) => l.pc === pcAtual)
    let ligados = 0
    for (const n of [1, 2]) {
      const l = linhas.find((x) => x.sistema === n)
      const on = !!l?.conectado
      if (on) ligados++
      document.getElementById('b' + n).className = 'bolinha ' + (on ? 'on' : 'off')
      document.getElementById('t' + n).textContent = on ? 'conectado' : 'desconectado'
    }
    if (ligados === 2) {
      resumo.textContent = `PC ${pcAtual} pronto: recebe CNPJs da fila.`
      resumo.style.color = '#16a34a'
    } else {
      resumo.textContent = `PC ${pcAtual} fora da fila: precisa dos 2 sistemas abertos e conectados.`
      resumo.style.color = '#b42318'
    }
  } catch (err) {
    resumo.textContent = 'Não consegui ver a conexão (' + err.message + ').'
    resumo.style.color = '#b42318'
  }
}

async function iniciar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url?.includes('portaleasyvendas.timbrasil.com.br')) {
    tabId = tab.id
  } else {
    secaoAba.style.display = 'none'
  }

  try {
    const resp = await chrome.runtime.sendMessage({ tipo: 'crivo:pegarSistemaDaAba', tabId })
    pcAtual = resp?.pc || null
    marcar(radiosPc, pcAtual ? String(pcAtual) : '')
    // Sem escolha ainda: mostra o que a aba está usando pelo endereço.
    marcar(radiosAba, resp?.aba ? String(resp.aba) : sistemaPelaUrl(tab?.url || ''))
  } catch (err) {
    aviso.textContent = 'Não consegui falar com a extensão (' + (err?.message || 'erro desconhecido') + '). Recarrega a extensão em chrome://extensions e abre o ícone de novo.'
  }

  atualizarConexao()
  setInterval(atualizarConexao, 3000)
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

radiosPc.forEach((r) => {
  r.addEventListener('change', () => {
    if (!r.checked) return
    pcAtual = Number(r.value)
    salvar({ tipo: 'crivo:definirPc', numero: pcAtual }, `Este computador agora é o PC ${r.value}. As abas do Easy Vendas vão recarregar.`)
    atualizarConexao()
  })
})

radiosAba.forEach((r) => {
  r.addEventListener('change', () => {
    if (!r.checked || tabId == null) return
    const nome = r.value === '1' ? 'Sistema 1 (cliente)' : 'Sistema 2 (negociação)'
    salvar({ tipo: 'crivo:definirSistema', tabId, numero: Number(r.value) }, `Esta aba agora é o ${nome} — ela vai recarregar sozinha.`)
  })
})

iniciar()
