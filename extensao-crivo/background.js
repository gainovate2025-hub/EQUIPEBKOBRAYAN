// Extensão Crivo — guarda se cada aba do Easy Vendas é o 1º ou o 2º
// sistema. 1.5.0 (11/11/2026): um PC só, sem escolha de PC. A escolha por
// aba fica no chrome.storage.session por tabId (e também na própria aba,
// veja pegarNumeroSistema em easyvendas.js).

function chave(tabId) {
  return `sistema_aba_${tabId}`
}

// null quando ninguém escolheu nada pra essa aba ainda.
async function pegarDaAba(tabId) {
  if (tabId == null) return null
  const r = await chrome.storage.session.get(chave(tabId))
  return r[chave(tabId)] === 1 || r[chave(tabId)] === 2 ? r[chave(tabId)] : null
}

// Impede o Chrome de "descarregar" (Memory Saver / economia de memória) a
// aba do Easy Vendas quando ela fica em segundo plano por um tempo — sem
// isso, a aba virava um "zumbi" sem processo nenhum rodando até a pessoa
// clicar nela de novo, parando a automação se a pessoa ficasse numa outra
// aba (ex: o site do BKO) por alguns minutos. Mesma correção já aplicada
// na extensão do P2B.
function manterAbaAcordada(tabId) {
  chrome.tabs.update(tabId, { autoDiscardable: false }, () => {
    if (chrome.runtime.lastError) {
      // ignora — não é crítico, só uma otimização
    }
  })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.tipo === 'crivo:abaAtiva') {
    if (sender.tab?.id != null) manterAbaAcordada(sender.tab.id)
    return false
  }

  // Popup: sistema desta aba.
  if (msg?.tipo === 'crivo:definirSistema') {
    chrome.storage.session.set({ [chave(msg.tabId)]: msg.numero === 2 ? 2 : 1 }).then(() => {
      chrome.tabs.sendMessage(msg.tabId, { tipo: 'crivo:recarregar', numero: msg.numero }).catch(() => {})
      sendResponse({ ok: true })
    })
    return true // resposta assíncrona
  }

  // Aba reaberta pelo Chrome (id novo) devolvendo a escolha que ela lembra.
  if (msg?.tipo === 'crivo:lembrarSistemaDaAba') {
    if (sender.tab?.id != null) chrome.storage.session.set({ [chave(sender.tab.id)]: msg.numero === 2 ? 2 : 1 })
    return false
  }

  // Content script pergunta ao carregar.
  if (msg?.tipo === 'crivo:pegarSistema') {
    pegarDaAba(sender.tab?.id).then((aba) => sendResponse({ aba }))
    return true
  }

  // Popup: mostra o que está escolhido hoje.
  if (msg?.tipo === 'crivo:pegarSistemaDaAba') {
    pegarDaAba(msg.tabId).then((aba) => sendResponse({ aba }))
    return true
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(chave(tabId))
})
