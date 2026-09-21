// Conversa com o bot no terminal, como se fosse o cliente. Sem WhatsApp, sem token.
// Rodar:  node whatsapp-bot/simulador.js   (Ctrl+C pra sair)
import readline from 'node:readline'
import { responder } from './menu.js'

let conversa
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'Cliente> ' })
rl.prompt()
rl.on('line', (linha) => {
  const r = responder(conversa, linha)
  conversa = r.conversa
  if (r.respostas.length === 0) console.log('\n[bot fica quieto — atendente assume]\n')
  for (const resposta of r.respostas) console.log(`\nTIM Empresas>\n${resposta}\n`)
  rl.prompt()
})
