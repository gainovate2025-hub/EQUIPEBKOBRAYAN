// Liga o bot num WhatsApp comum escaneando um QR code (como no WhatsApp Web).
// Método NÃO oficial: serve pra testar num número seu. O WhatsApp pode bloquear
// números que usam isso — não use no número principal de clientes.
//
// Rodar (uma vez, dentro da pasta whatsapp-bot):  npm install
// Depois:
//   node whatsapp-bot/conectar-qr.js 5511999998888     só responde a esse(s) número(s)
//   node whatsapp-bot/conectar-qr.js --todos           responde a QUALQUER pessoa
// Números com 55 + DDD, só dígitos; pode passar vários separados por espaço.
//
// A sessão fica salva em whatsapp-bot/sessao-qr (é a "senha" do seu WhatsApp:
// nunca suba pro GitHub — já está no .gitignore). Pra desconectar, apague a
// pasta e confirme em WhatsApp > Aparelhos conectados.

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { responder } from './menu.js'

const args = process.argv.slice(2)
const responderATodos = args.includes('--todos')
const permitidos = args.filter((a) => /^\d{10,15}$/.test(a))

if (!responderATodos && permitidos.length === 0) {
  console.error('Diga quem pode receber resposta, senão o bot responderia até seus amigos e família.')
  console.error('  node whatsapp-bot/conectar-qr.js 5511999998888   (número de quem vai testar)')
  console.error('  node whatsapp-bot/conectar-qr.js --todos         (responde a todo mundo)')
  process.exit(1)
}

const pastaSessao = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sessao-qr')
const conversas = new Map() // contato -> { estado, ultimaMsgEm }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const digitosDe = (jid) => (jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

// Contatos novos podem chegar com um id interno (@lid) em vez do telefone; quando
// o WhatsApp informa o telefone junto (remoteJidAlt), usa ele pra conferir a lista.
function podeResponder(key) {
  if (responderATodos) return true
  const candidatos = [key.remoteJid, key.remoteJidAlt].map(digitosDe).filter(Boolean)
  return candidatos.some((n) => permitidos.includes(n))
}

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState(pastaSessao)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }) })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nNo celular: WhatsApp > Aparelhos conectados > Conectar um aparelho. Escaneie:\n')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') {
      console.log(responderATodos
        ? '\nConectado! Respondendo a TODOS que mandarem mensagem.'
        : `\nConectado! Só respondendo a: ${permitidos.join(', ')}`)
      console.log('Manda uma mensagem de OUTRO celular pra esse número pra testar (mensagem pra si mesmo é ignorada).\n')
    }
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      if (codigo === DisconnectReason.loggedOut) {
        console.error('Desconectado pelo celular. Apague a pasta whatsapp-bot/sessao-qr e rode de novo pra ler outro QR.')
        process.exit(1)
      }
      console.log('Conexão caiu, reconectando…')
      iniciar()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      const jid = msg.key.remoteJid
      if (!jid || msg.key.fromMe) continue
      if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue

      if (!podeResponder(msg.key)) {
        console.log(`(ignorada) mensagem de ${jid}${msg.key.remoteJidAlt ? ` / ${msg.key.remoteJidAlt}` : ''} — fora da lista`)
        continue
      }

      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
      const { respostas, conversa } = responder(conversas.get(jid), texto)
      conversas.set(jid, conversa)
      console.log(`${jid} disse: "${texto}" -> ${respostas.length ? `${respostas.length} resposta(s)` : 'bot quieto (atendente)'}`)

      for (const resposta of respostas) {
        await sock.sendPresenceUpdate('composing', jid)
        await dormir(1200)
        await sock.sendMessage(jid, { text: resposta })
      }
    }
  })
}

iniciar()
