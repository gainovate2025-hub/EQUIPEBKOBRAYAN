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
checar('1 mantém o bot ativo (estado menu)', r.conversa.estado === 'menu')

// opção 2 - portabilidade, e "3" depois dela leva pra equipe
r = responder(c, '2', minutos(1))
checar('2 responde portabilidade (7678 e 4196)', r.respostas[0].includes('7678') && r.respostas[0].includes('4196'))
r = responder(r.conversa, '3', minutos(2))
checar('"3" depois da portabilidade vai pra questões contratuais', r.respostas[0].includes('Questões contratuais'))

// 3/4/5/6 passam pra atendente: bot fica quieto até "menu"
for (const n of ['3', '4', '5', '6']) {
  r = responder(c, n, minutos(1))
  checar(`${n} passa pra atendente`, r.conversa.estado === 'humano' && r.respostas[0].startsWith('Você selecionou'))
  const quieto = responder(r.conversa, '12.345.678/0001-90 quero cancelar', minutos(2))
  checar(`depois do ${n} o bot fica quieto`, quieto.respostas.length === 0)
  const volta = responder(quieto.conversa, 'MENU', minutos(3))
  checar(`depois do ${n}, "MENU" volta pro menu`, volta.respostas[0] === MENU && volta.conversa.estado === 'menu')
}

// variações de digitação e texto sem sentido
checar('"Menu " (com espaço/maiúscula) volta pro menu', responder(c, ' Menu ', minutos(1)).respostas[0] === MENU)
checar('"opção 4" é aceito como 4', responder(c, 'opção 4', minutos(1)).respostas[0].includes('novas linhas'))
r = responder(c, 'blablabla', minutos(1))
checar('texto sem sentido pede de novo o menu', r.respostas[0].includes('Não entendi') && r.respostas[0].includes(MENU))
checar('"9" não é opção válida', responder(c, '9', minutos(1)).respostas[0].includes('Não entendi'))
checar('CNPJ (vários dígitos) não vira opção', responder(c, '12345678000190', minutos(1)).respostas[0].includes('Não entendi'))

// conversa antiga recomeça no menu
r = responder({ estado: 'humano', ultimaMsgEm: T0 }, 'oi de novo', T0 + 13 * 3600 * 1000)
checar('depois de 13h sem falar, recomeça pelo menu', r.respostas[0] === MENU)

console.log(falhas === 0 ? '\nTudo passou.' : `\n${falhas} teste(s) falharam.`)
process.exit(falhas === 0 ? 0 : 1)
