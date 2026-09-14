// Extensão Crivo — guarda, POR ABA, se ela é o "1º sistema" ou "2º sistema".
//
// Antes essa escolha ficava salva numa chave só pra extensão inteira — por
// isso, ao mudar a 2ª aba pra "2º sistema", a 1ª aba (que também lia essa
// mesma chave) virava "2º sistema" junto. Agora cada aba tem a sua própria
// escolha, guardada por tabId.

function chave(tabId) {
  return `sistema_aba_${tabId}`
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.tipo === 'crivo:definirSistema') {
    chrome.storage.session.set({ [chave(msg.tabId)]: msg.numero }).then(() => {
      chrome.tabs.sendMessage(msg.tabId, { tipo: 'crivo:recarregar' }).catch(() => {})
      sendResponse({ ok: true })
    })
    return true // resposta assíncrona
  }

  if (msg?.tipo === 'crivo:pegarSistema') {
    const tabId = sender.tab?.id
    if (tabId == null) { sendResponse({ numero: 1 }); return }
    chrome.storage.session.get(chave(tabId)).then((r) => {
      sendResponse({ numero: r[chave(tabId)] === 2 ? 2 : 1 })
    })
    return true
  }

  if (msg?.tipo === 'crivo:pegarSistemaDaAba') {
    chrome.storage.session.get(chave(msg.tabId)).then((r) => {
      sendResponse({ numero: r[chave(msg.tabId)] === 2 ? 2 : 1 })
    })
    return true
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(chave(tabId))
})
