// Servidor do bot de atendimento no WhatsApp (API oficial da Meta — WhatsApp
// Cloud API). Sem dependências: só o Node (precisa da versão 18 ou mais nova).
//
// Variáveis de ambiente (pegar em developers.facebook.com > seu app > WhatsApp):
//   WHATSAPP_TOKEN            token de acesso (permanente, do usuário do sistema)
//   WHATSAPP_PHONE_NUMBER_ID  ID do número que atende (não é o telefone em si)
//   WHATSAPP_VERIFY_TOKEN     texto qualquer que você inventa; cola o mesmo no
//                             painel da Meta ao cadastrar o webhook
//   WHATSAPP_APP_SECRET       (recomendado) segredo do app — confere que as
//                             mensagens vêm mesmo da Meta
//   PORT                      padrão 4200
//
// Rodar:  node whatsapp-bot/server.js
// O endereço do webhook (https, público) é  <seu-endereco>/webhook

import http from 'node:http'
import crypto from 'node:crypto'
import { responder } from './menu.js'

const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET,
  PORT = 4200,
} = process.env

const conversas = new Map() // telefone -> { estado, ultimaMsgEm } (some se reiniciar o servidor)
const idsVistos = new Set() // a Meta reenvia a mesma mensagem se demorar a responder

async function enviarTexto(para, texto) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto } }),
  })
  if (!res.ok) console.error('Falha ao enviar pra', para, res.status, await res.text())
}

async function tratarMensagem(msg) {
  if (idsVistos.has(msg.id)) return
  idsVistos.add(msg.id)
  if (idsVistos.size > 2000) idsVistos.delete(idsVistos.values().next().value)

  // Áudio, foto etc. contam como "mensagem qualquer": sem texto, cai no menu/fica quieto igual.
  const texto = msg.type === 'text' ? msg.text?.body : ''
  const { respostas, conversa } = responder(conversas.get(msg.from), texto)
  conversas.set(msg.from, conversa)
  for (const resposta of respostas) await enviarTexto(msg.from, resposta)
}

function assinaturaValida(corpoBruto, cabecalho) {
  if (!WHATSAPP_APP_SECRET) return true
  const esperado = 'sha256=' + crypto.createHmac('sha256', WHATSAPP_APP_SECRET).update(corpoBruto).digest('hex')
  const a = Buffer.from(esperado)
  const b = Buffer.from(cabecalho || '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/webhook') {
    res.writeHead(200).end('Bot de atendimento no ar')
    return
  }

  // A Meta chama isso uma vez, ao cadastrar o webhook, pra confirmar que o endereço é seu.
  if (req.method === 'GET') {
    const certo = url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN
    if (certo) res.writeHead(200).end(url.searchParams.get('hub.challenge'))
    else res.writeHead(403).end()
    return
  }

  if (req.method === 'POST') {
    const pedacos = []
    req.on('data', (p) => pedacos.push(p))
    req.on('end', () => {
      const bruto = Buffer.concat(pedacos)
      if (!assinaturaValida(bruto, req.headers['x-hub-signature-256'])) {
        res.writeHead(401).end()
        return
      }
      res.writeHead(200).end() // responde já — o processamento vem depois
      try {
        const corpo = JSON.parse(bruto.toString('utf8'))
        const mensagens = (corpo.entry || []).flatMap((e) => e.changes || []).flatMap((c) => c.value?.messages || [])
        mensagens.reduce((fila, m) => fila.then(() => tratarMensagem(m)), Promise.resolve())
          .catch((err) => console.error('Erro tratando mensagem:', err))
      } catch (err) {
        console.error('Corpo inválido:', err.message)
      }
    })
    return
  }

  res.writeHead(405).end()
})

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_VERIFY_TOKEN) {
  console.error('Faltam variáveis: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_VERIFY_TOKEN.')
  process.exit(1)
}
if (!WHATSAPP_APP_SECRET) console.warn('Aviso: sem WHATSAPP_APP_SECRET — não estou conferindo se as mensagens vêm da Meta.')

servidor.listen(PORT, () => console.log(`Bot de atendimento ouvindo na porta ${PORT} (/webhook)`))
