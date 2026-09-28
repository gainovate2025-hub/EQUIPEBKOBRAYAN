// Roda com: node whatsapp-bot/teste.js
import { responder, MENU } from './menu.js'

let falhas = 0
function checar(nome, ok) {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`)
  if (!ok) falhas++
}

const T0 = Date.UTC(2026, 8, 21, 12, 0, 0)
const minutos = (n) => T0 + n * 60 * 1000

// primeira mensagem, qualquer que seja, mostra o menu
let r = responder(undefined, 'oi', T0)
checar('primeira mensagem ("oi") mostra o menu', r.respostas[0] === MENU)
r = responder(undefined, '1', T0)
checar('primeira mensagem ("1") também mostra o menu, não a fatura', r.respostas[0] === MENU)

// opção 1 - fatura
let c = responder(undefined, 'oi', T0).conversa
r = responder(c, '1', minutos(1))
checar('1 responde a fatura com timnegocia', r.respostas[0].includes('https://www.timnegocia.com.br'))
c = r.conversa

// opção 2 - portabilidade
r = responder(c, '2', minutos(2))
checar('2 responde portabilidade (7678 e 4196)', r.respostas[0].includes('7678') && r.respostas[0].includes('4196'))
c = r.conversa

// "3" pede atendente — já sabe o assunto (portabilidade, o último escolhido) — pula direto pro nome
r = responder(c, '3', minutos(3))
checar('3 (já com assunto conhecido) pula direto pra pedir o nome', r.respostas[0].toLowerCase().includes('nome'))
checar('ainda não encaminha sem nome/cnpj', !r.encaminhar)
c = r.conversa

r = responder(c, 'João da Silva', minutos(4))
checar('depois do nome, pede o CNPJ', r.respostas[0].toLowerCase().includes('cnpj'))
checar('ainda não encaminha sem CNPJ', !r.encaminhar)
c = r.conversa

r = responder(c, '11.222.333/0001-44', minutos(5))
checar('depois do CNPJ, confirma e encaminha', r.respostas[0].includes('João da Silva'))
checar('encaminhar tem os dados certos', r.encaminhar?.assunto === 'portabilidade' && r.encaminhar?.nome === 'João da Silva' && r.encaminhar?.cnpj === '11.222.333/0001-44')
checar('depois de encaminhar, fica no estado "humano"', r.conversa.estado === 'humano')
c = r.conversa

// depois de encaminhado, bot fica quieto até "menu"
r = responder(c, 'obrigado', minutos(6))
checar('depois de encaminhado, bot fica quieto', r.respostas.length === 0)
r = responder(r.conversa, 'MENU', minutos(7))
checar('"MENU" (maiúsculo) volta pro menu depois de encaminhado', r.respostas[0] === MENU)

// pedir atendente sem ter escolhido 1/2 antes — pergunta o assunto primeiro
let c2 = responder(undefined, 'oi', T0).conversa
r = responder(c2, '3', minutos(1))
checar('"3" sem assunto conhecido pergunta Fatura ou Portabilidade', /fatura ou portabilidade/i.test(r.respostas[0]))
r = responder(r.conversa, '1', minutos(2))
checar('depois de escolher 1 na pergunta, pede o nome', r.respostas[0].toLowerCase().includes('nome'))

// digitar "atendente"/"humano" também funciona, não só "3"
let c3 = responder(undefined, 'oi', T0).conversa
r = responder(c3, 'quero falar com um atendente', minutos(1))
checar('digitar "atendente" funciona igual "3"', /fatura ou portabilidade/i.test(r.respostas[0]))

// mensagem não reconhecida no estado menu
let c4 = responder(undefined, 'oi', T0).conversa
r = responder(c4, 'blablabla', minutos(1))
checar('mensagem não reconhecida mostra aviso + menu', r.respostas[0].startsWith('Não entendi') && r.respostas[0].includes(MENU))

console.log(falhas === 0 ? '\nTudo certo ✅' : `\n${falhas} falha(s) ❌`)
process.exit(falhas === 0 ? 0 : 1)
