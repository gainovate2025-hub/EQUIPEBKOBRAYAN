// Edge Function: sheets-faturas
// Conecta no Google Sheets (planilha "Controle de fatura") pra ler e
// escrever dados — usa uma conta de serviço do Google (credencial guardada
// só aqui, nunca no navegador) pra autenticar.
//
// Rode no ambiente do Supabase (Deno).
//
// Deploy:
//   supabase functions deploy sheets-faturas
//
// Precisa da secret GOOGLE_SERVICE_ACCOUNT_JSON configurada (o conteúdo
// INTEIRO do arquivo .json baixado na conta de serviço do Google Cloud) —
// veja instruções de onde colar isso no painel do Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// Planilha padrão ("Controle de fatura") — cada módulo (fatura/
// contestação) pode apontar pra outra planilha via config, mandando o
// spreadsheetId no corpo da chamada; sem isso, cai nessa aqui.
const SPREADSHEET_ID_PADRAO = '1F7mJZUAE85F_k0s4cX66DI0ERtY10CaGLuJnpCa48qk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resposta(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function base64Url(bytes) {
  let binario = ''
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDeTexto(texto) {
  return base64Url(new TextEncoder().encode(texto))
}

// Importa a chave privada (formato PEM, vem dentro do JSON da conta de
// serviço) pra poder assinar o JWT — o Google exige RS256.
async function importarChavePrivada(pem) {
  const corpo = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binario = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    binario.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

// Fluxo padrão do Google pra conta de serviço: monta um JWT assinado e
// troca ele por um token de acesso (válido por 1h) — sem isso não dá pra
// chamar a API do Sheets.
async function pegarTokenDeAcesso(contaServico) {
  const agora = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: contaServico.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }
  const semAssinar = `${base64UrlDeTexto(JSON.stringify(header))}.${base64UrlDeTexto(JSON.stringify(claim))}`
  const chave = await importarChavePrivada(contaServico.private_key)
  const assinatura = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    chave,
    new TextEncoder().encode(semAssinar)
  )
  const jwt = `${semAssinar}.${base64Url(assinatura)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${await resp.text()}`)
  const dados = await resp.json()
  return dados.access_token
}

async function lerIntervalo(token, spreadsheetId, intervalo) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(intervalo)}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`)
  const dados = await resp.json()
  return dados.values || []
}

async function escreverIntervalo(token, spreadsheetId, intervalo, valor) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(intervalo)}?valueInputOption=USER_ENTERED`
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: intervalo, values: [[valor]] }),
  })
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`)
}

// Mesmo jeito do site (src/lib/api.js): aceita o link inteiro ou só o ID.
function extrairSpreadsheetId(urlOuId) {
  const texto = (urlOuId || '').trim()
  const match = texto.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : texto
}

// Papéis que usam as telas ligadas à planilha (Faturas do BKO e a
// configuração do supervisor). Operação e cadastro não usam.
const PAPEIS_PERMITIDOS = ['supervisor', 'lider', 'bko']
// Operação e cadastro só mexem na planilha de vendas (10/11/2026): a ficha
// salva em "Consulta CNPJ e venda" entra numa linha nova dela.
const PAPEIS_SO_VENDAS = ['operacao', 'cadastro']

async function listarAbas(token, spreadsheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`)
  const dados = await resp.json()
  return (dados.sheets || []).map((s) => s.properties.title)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Só usuário autenticado no site pode chamar essa função.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) {
      return resposta({ error: 'Não autenticado.' }, 401)
    }

    // Confere o papel de quem chama (10/11/2026). Antes qualquer conta
    // logada (até operação/cadastro) podia ler e escrever em QUALQUER
    // planilha que a conta de serviço do Google tivesse acesso, mandando
    // o spreadsheetId que quisesse.
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: perfil } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!perfil || (!PAPEIS_PERMITIDOS.includes(perfil.role) && !PAPEIS_SO_VENDAS.includes(perfil.role))) {
      return resposta({ error: 'Seu usuário não tem acesso à planilha.' }, 403)
    }

    const contaServicoTexto = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!contaServicoTexto) {
      return resposta({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON não configurado.' }, 500)
    }
    const contaServico = JSON.parse(contaServicoTexto)
    const token = await pegarTokenDeAcesso(contaServico)

    const { action, intervalo, valor, spreadsheetId } = await req.json()
    const idPlanilha = spreadsheetId || SPREADSHEET_ID_PADRAO

    // Listar abas é usado só na tela de Configurações do supervisor, ANTES
    // de salvar a planilha nova (pra escolher a aba). Por isso aceita
    // qualquer planilha, mas só pro supervisor.
    if (action === 'listar_abas') {
      if (perfil.role !== 'supervisor') {
        return resposta({ error: 'Só o supervisor pode configurar a planilha.' }, 403)
      }
      const abas = await listarAbas(token, idPlanilha)
      return resposta({ abas })
    }

    // Ler/escrever: só na planilha + aba que o supervisor configurou em
    // planilha_modulos_config (sheet_url em branco = planilha padrão).
    if (action === 'ler' || action === 'escrever') {
      const { data: modulos, error: erroModulos } = await admin
        .from('planilha_modulos_config')
        .select('modulo, aba_nome, sheet_url')
      if (erroModulos) return resposta({ error: erroModulos.message }, 500)
      const soVendas = PAPEIS_SO_VENDAS.includes(perfil.role)
      const permitido = (modulos || []).some((m) => {
        if (soVendas && m.modulo !== 'vendas') return false
        const idDoModulo = extrairSpreadsheetId(m.sheet_url) || SPREADSHEET_ID_PADRAO
        return m.aba_nome && idDoModulo === idPlanilha && String(intervalo || '').startsWith(`${m.aba_nome}!`)
      })
      if (!permitido) {
        return resposta({ error: 'Essa planilha ou aba não está configurada no painel.' }, 403)
      }
    }

    if (action === 'ler') {
      if (!intervalo) return resposta({ error: 'Falta o intervalo (ex: NomeDaAba!A1:Z100).' }, 400)
      const valores = await lerIntervalo(token, idPlanilha, intervalo)
      return resposta({ valores })
    }

    if (action === 'escrever') {
      if (!intervalo || valor === undefined) {
        return resposta({ error: 'Falta o intervalo e/ou o valor.' }, 400)
      }
      await escreverIntervalo(token, idPlanilha, intervalo, valor)
      return resposta({ ok: true })
    }

    return resposta({ error: 'action desconhecida (use listar_abas, ler ou escrever).' }, 400)
  } catch (err) {
    return resposta({ error: String(err?.message || err) }, 500)
  }
})
