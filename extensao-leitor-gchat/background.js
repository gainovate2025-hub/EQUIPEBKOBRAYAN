// Manda cada par CNPJ + resposta pro Painel BKO (Supabase, chave pública).
const SUPABASE_URL = 'https://cdbvevtsaorburbmogpk.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

let contador = 0

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.tipo === 'gchat:vendo') {
    // "v" + quantas respostas (CNPJ + APROVADO/REPROVADO) estão na tela;
    // depois de mandar, o número vira o total mandado.
    if (!contador) {
      chrome.action.setBadgeText({ text: `v${msg.pares}` })
      chrome.action.setBadgeBackgroundColor({ color: msg.pares ? '#1f6feb' : '#9a6700' })
    }
    chrome.action.setTitle({ title: `Leitor do Google Chat: ${msg.cnpjs} CNPJ(s) na tela, ${msg.pares} com resposta` })
    return false
  }
  if (msg?.tipo !== 'gchat:registrar') return false
  fetch(`${SUPABASE_URL}/rest/v1/rpc/crivo_gchat_registrar`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_cnpj: msg.cnpj, p_resposta: msg.resposta, p_texto: msg.texto }),
  })
    .then(async (res) => {
      if (!res.ok) return sendResponse({ ok: false, erro: await res.text() })
      const r = await res.json()
      if (r === 'novo') {
        contador++
        chrome.action.setBadgeText({ text: String(contador) })
        chrome.action.setBadgeBackgroundColor({ color: '#1f6feb' })
      }
      sendResponse({ ok: true, r })
    })
    .catch((err) => sendResponse({ ok: false, erro: err.message }))
  return true
})
