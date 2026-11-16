// Leitor do Google Chat (16/11/2026, pedido do Brayan).
// Só LÊ a tela: não escreve nem clica em nada no chat.
//
// No chat "PEDIDOS TIM EMPRESAS." cada resposta cita a mensagem do CNPJ e
// embaixo vem a resposta, assim:
//     PEDIDOS TIM EMPRESAS.
//     24832033000166
//     APROVADO
// A cada 5 segundos o leitor procura uma linha com CNPJ seguida (logo
// abaixo) de APROVADO/REPROVADO e manda cada par novo pro Painel BKO.

const RESPOSTAS = [
  [/reprov|negad/i, 'REPROVADO'],
  [/aprov/i, 'APROVADO'],
  [/cnpj\s*(errado|invalido|inválido)|nao encontrad|não encontrad/i, 'CNPJ ERRADO'],
]

function cnpjDaLinha(linha) {
  const m = /^\D{0,3}(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\D{0,3}$/.exec(linha)
  return m ? m[1].replace(/\D/g, '') : null
}

function respostaDaLinha(linha) {
  if (!linha || linha.length > 40) return null
  for (const [re, valor] of RESPOSTAS) if (re.test(linha)) return valor
  return null
}

function lerPares() {
  const linhas = (document.body?.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const pares = []
  for (let i = 0; i < linhas.length - 1; i++) {
    const cnpj = cnpjDaLinha(linhas[i])
    if (!cnpj) continue
    // 1.0.1: a resposta pode vir até 3 linhas abaixo (ícone, "citação" etc.),
    // desde que não apareça outro CNPJ no meio.
    for (let j = i + 1; j <= i + 3 && j < linhas.length; j++) {
      if (cnpjDaLinha(linhas[j])) break
      const resposta = respostaDaLinha(linhas[j])
      if (resposta) {
        pares.push({ cnpj, resposta, texto: `${linhas[i - 1] || ''} | ${linhas[i]} | ${linhas[j]}` })
        break
      }
    }
  }
  return pares
}

async function rodada() {
  const pares = lerPares()
  // 1.0.1: mostra no ícone que o leitor está rodando nesta tela e quantas
  // respostas está vendo agora (ex: "v12"). Sem nada no ícone = não rodou.
  const cnpjsNaTela = (document.body?.innerText || '').split('\n').filter((l) => cnpjDaLinha(l.trim())).length
  if (cnpjsNaTela) chrome.runtime.sendMessage({ tipo: 'gchat:vendo', pares: pares.length, cnpjs: cnpjsNaTela }).catch(() => {})
  if (!pares.length) return
  const dia = new Date().toLocaleDateString('pt-BR')
  const { enviados = {} } = await chrome.storage.local.get('enviados')
  let novos = 0
  for (const p of pares) {
    const chave = `${dia}|${p.cnpj}|${p.resposta}`
    if (enviados[chave]) continue
    const r = await chrome.runtime.sendMessage({ tipo: 'gchat:registrar', ...p }).catch(() => null)
    if (r?.ok) {
      enviados[chave] = Date.now()
      novos++
    }
  }
  if (novos) {
    // guarda só os últimos 3 dias pra não crescer pra sempre
    const limite = Date.now() - 3 * 24 * 3600 * 1000
    for (const [k, t] of Object.entries(enviados)) if (t < limite) delete enviados[k]
    await chrome.storage.local.set({ enviados })
    console.log(`[Leitor Google Chat] ${novos} resposta(s) nova(s) mandada(s) pro Painel BKO`)
  }
}

setInterval(() => rodada().catch((e) => console.log('[Leitor Google Chat] falha:', e.message)), 5000)
