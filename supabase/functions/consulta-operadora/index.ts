// Edge Function: consulta-operadora
// Descobre qual operadora (Vivo/Claro/TIM) atende um número de celular,
// consultando o site consultaoperadora.com.br do lado do servidor — o
// navegador não consegue chamar esse site direto (ele não libera CORS
// pra outros domínios), então essa função faz a ponte.
//
// Confirmado ao vivo (26/10/2026) pelo Brayan: o formulário do site
// manda POST pra site2015/resposta.php com os campos:
//   tipo=consulta
//   numero=<DDD + número, 10 ou 11 dígitos, sem o 0 inicial>
// e a resposta é uma página HTML com um texto do tipo:
//   "Operadora: Claro (Móvel/SMP)"
//   "Portado: NÃO"
//   "Número: 11978751958"
//
// RASCUNHO: a extração do texto é feita com regex em cima do HTML (não
// tem uma API de verdade) — se o site mudar o layout da resposta, isso
// pode parar de reconhecer corretamente. Ajustar os regex abaixo se isso
// acontecer.
//
// Deploy:
//   supabase functions deploy consulta-operadora

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Tira todo HTML e junta espaços, pra procurar os textos "Operadora:" e
// "Portado:" sem depender da estrutura exata das tags ao redor.
function textoSemHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarOperadora(textoBruto: string) {
  const s = textoBruto.toLowerCase()
  if (s.includes('vivo')) return 'VIVO'
  if (s.includes('claro')) return 'CLARO'
  if (/\btim\b/.test(s)) return 'TIM'
  if (s.includes('oi')) return 'OI'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Só exige estar logado (qualquer papel) — não é uma ação sensível
    // como trocar senha, só precisa não ser aberta pro mundo todo.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) {
      return resposta({ error: 'Não autenticado.' }, 401)
    }

    const { numero } = await req.json()
    const numeroLimpo = String(numero || '').replace(/\D/g, '').replace(/^0+/, '')
    if (numeroLimpo.length < 10 || numeroLimpo.length > 11) {
      return resposta({ error: 'Número inválido — precisa ter DDD + número (10 ou 11 dígitos).' }, 400)
    }

    const resConsulta = await fetch('https://consultaoperadora.com.br/site2015/resposta.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `tipo=consulta&numero=${numeroLimpo}`,
    })

    if (!resConsulta.ok) {
      return resposta({ error: `Site de consulta respondeu ${resConsulta.status}.` }, 502)
    }

    const html = await resConsulta.text()
    const texto = textoSemHtml(html)

    const matchOperadora = /Operadora:\s*([^|]+?)(?=\s*Portado:|\s*N[úu]mero:|$)/i.exec(texto)
    const matchPortado = /Portado:\s*(SIM|N[AÃ]O)/i.exec(texto)

    if (!matchOperadora) {
      return resposta({ error: 'Não consegui ler a operadora na resposta do site — texto não reconhecido.' }, 502)
    }

    const operadoraBruta = matchOperadora[1].trim()
    const operadora = normalizarOperadora(operadoraBruta)
    const portado = matchPortado ? /^SIM$/i.test(matchPortado[1]) : null

    return resposta({
      numero: numeroLimpo,
      operadora, // 'VIVO' | 'CLARO' | 'TIM' | 'OI' | null (não reconhecida)
      operadoraBruta, // texto cru, ex: "Claro (Móvel/SMP)" — pra mostrar/depurar
      portado, // true/false/null (não veio no texto)
    })
  } catch (err) {
    return resposta({ error: String(err) }, 500)
  }
})
