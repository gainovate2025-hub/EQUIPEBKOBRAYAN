// Extensão Crivo — guarda o número do PC e o sistema de cada aba.
//
// 1.6.0 (12/11/2026): 3 PCs. Cada computador tem um número (PC 1, 2 ou 3),
// salvo no chrome.storage.local (não some ao fechar o Chrome). Dentro do
// PC, cada aba do Easy Vendas é o 1º sistema (cliente) ou o 2º
// (negociação) — escolha por aba, guardada no chrome.storage.session por
// tabId (e também na própria aba, veja pegarNumeroSistema em easyvendas.js).
// Sem PC escolhido, a extensão não pega nenhum CNPJ.

const CHAVE_PC = 'crivoPc'

function chave(tabId) {
  return `sistema_aba_${tabId}`
}

async function pegarPc() {
  const r = await chrome.storage.local.get(CHAVE_PC)
  return [1, 2, 3].includes(r[CHAVE_PC]) ? r[CHAVE_PC] : null
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
// clicar nela de novo. Mesma correção já aplicada na extensão do P2B.
function manterAbaAcordada(tabId) {
  chrome.tabs.update(tabId, { autoDiscardable: false }, () => {
    if (chrome.runtime.lastError) {
      // ignora — não é crítico, só uma otimização
    }
  })
}

async function recarregarAbasEasyVendas() {
  const abas = await chrome.tabs.query({ url: 'https://portaleasyvendas.timbrasil.com.br/*' })
  for (const aba of abas) chrome.tabs.reload(aba.id).catch(() => {})
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 1.6.8: CEP da empresa (OpenCNPJ) buscado aqui, fora da página do Easy
  // Vendas, pra não depender das regras de segurança do site da TIM.
  if (msg?.tipo === 'crivo:cepEmpresa') {
    // 1.6.9: OpenCNPJ respondeu 403 pra extensão; tenta 3 fontes.
    // 1.7.4: traz também o endereço (rua, número, bairro, complemento);
    // se a 1ª fonte vier sem rua, completa com a próxima.
    const cnpj = String(msg.cnpj || '').replace(/\D/g, '')
    const junta = (...partes) => partes.map((x) => String(x || '').trim()).filter(Boolean).join(' ')
    const fontes = [
      [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, (d) => ({ cep: d.cep, uf: d.uf, rua: junta(d.descricao_tipo_de_logradouro, d.logradouro), numero: d.numero, bairro: d.bairro, complemento: d.complemento, cidade: d.municipio })],
      [`https://api.opencnpj.org/${cnpj}`, (d) => ({ cep: d.cep, uf: d.uf, rua: junta(d.tipo_logradouro, d.logradouro), numero: d.numero, bairro: d.bairro, complemento: d.complemento, cidade: d.municipio })],
      [`https://publica.cnpj.ws/cnpj/${cnpj}`, (d) => { const e = d.estabelecimento || {}; return { cep: e.cep, uf: e.estado?.sigla, rua: junta(e.tipo_logradouro, e.logradouro), numero: e.numero, bairro: e.bairro, complemento: e.complemento, cidade: e.cidade?.nome } }],
    ]
    ;(async () => {
      const erros = []
      let achado = null
      for (const [url, ler] of fontes) {
        try {
          const res = await fetch(url)
          if (!res.ok) { erros.push(`${new URL(url).host} ${res.status}`); continue }
          const r = ler(await res.json())
          r.cep = String(r.cep || '').replace(/\D/g, '')
          if (r.cep.length !== 8) { erros.push(`${new URL(url).host} sem CEP`); continue }
          if (!achado) achado = r
          else for (const k of ['rua', 'numero', 'bairro', 'complemento', 'cidade']) if (!achado[k] && r[k]) achado[k] = r[k]
          if (achado.rua && achado.bairro) break
        } catch (err) {
          erros.push(`${new URL(url).host} ${err.message}`)
        }
      }
      sendResponse(achado || { erro: erros.join('; ') })
    })()
    return true
  }

  if (msg?.tipo === 'crivo:abaAtiva') {
    if (sender.tab?.id != null) manterAbaAcordada(sender.tab.id)
    return false
  }

  // Popup: número deste PC. Recarrega as abas pra já valer.
  if (msg?.tipo === 'crivo:definirPc') {
    const numero = [1, 2, 3].includes(msg.numero) ? msg.numero : 1
    chrome.storage.local.set({ [CHAVE_PC]: numero }).then(async () => {
      await recarregarAbasEasyVendas()
      sendResponse({ ok: true })
    })
    return true
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
    Promise.all([pegarPc(), pegarDaAba(sender.tab?.id)]).then(([pc, aba]) => sendResponse({ pc, aba }))
    return true
  }

  // Popup: mostra o que está escolhido hoje.
  if (msg?.tipo === 'crivo:pegarSistemaDaAba') {
    Promise.all([pegarPc(), pegarDaAba(msg.tabId)]).then(([pc, aba]) => sendResponse({ pc, aba }))
    return true
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(chave(tabId))
})
