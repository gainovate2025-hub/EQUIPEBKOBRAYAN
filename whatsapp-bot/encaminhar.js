// encaminhar.js — grava no Supabase quando o bot (menu.js) decide que um
// caso precisa de um atendente humano. Usado pelos dois servidores
// (server.js e qr-server.js).
//
// Roteamento fixo por assunto: fatura vai pro time do Brayan,
// portabilidade vai pro time do Isaque. Dá pra trocar os times via
// variável de ambiente, sem mexer no código.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cdbvevtsaorburbmogpk.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkYnZldnRzYW9yYnVyYm1vZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzkwODcsImV4cCI6MjEwMjMxNTA4N30.JQS_71VpIHELYUBK27eY8X7asAA3LvzlXbbps8Iaeho'

// time do Brayan (fatura) / time do Isaque (portabilidade)
const TEAM_ID_FATURA = process.env.TEAM_ID_FATURA || 'b0266612-fbbc-4bfa-a8a9-5825defebd51'
const TEAM_ID_PORTABILIDADE = process.env.TEAM_ID_PORTABILIDADE || '3f2fd62d-1d73-45e5-88e4-270860245e3e'

// Chama isso sempre que responder() (menu.js) devolver um `encaminhar`.
// Nunca lança erro pra fora — se o Supabase falhar, só loga; a conversa
// com o cliente já terminou (ele já recebeu a confirmação).
export async function gravarCasoWhatsapp({ telefone, assunto, nome, cnpj }) {
  const team_id = assunto === 'fatura' ? TEAM_ID_FATURA : TEAM_ID_PORTABILIDADE
  try {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_casos`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ telefone, assunto, nome, cnpj, team_id }),
    })
    if (!resposta.ok) {
      console.error('[whatsapp] Falha ao gravar caso no Supabase:', resposta.status, await resposta.text())
    } else {
      console.log(`[whatsapp] Caso encaminhado: ${nome} (${assunto}) — ${telefone}`)
    }
  } catch (err) {
    console.error('[whatsapp] Erro ao gravar caso no Supabase:', err.message)
  }
}
