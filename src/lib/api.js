import { supabase, usernameToEmail, encerrarSeSessaoMorta } from './supabaseClient'

// ---------- leitura ----------

// teamId opcional: supervisor com equipe vinculada (ex: Brayan, na
// "Equipe Brayan") vê só o próprio time; sem equipe vinculada (contas
// de admin geral, como supervisao/will) continua vendo todo mundo.
export async function fetchTeam(teamId) {
  let query = supabase
    .from('profiles')
    .select('id, name, username, role, active, modulos_responsavel, performance(*)')
    .eq('role', 'bko')
    .order('name', { ascending: true })
  if (teamId) query = query.eq('team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  // performance.user_id é UNIQUE, então o PostgREST embute como objeto único
  // (não array) — não indexar com [0] aqui.
  return data.map((p) => ({ ...p, performance: p.performance ?? null }))
}

export async function fetchOwnPerformance(userId) {
  const { data, error } = await supabase
    .from('performance')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error) throw error
  return data
}

export async function fetchOwnDailyReports(userId) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchTeamRanking(teamId) {
  let query = supabase
    .from('profiles')
    .select('id, name, username, performance(commission, contestations_done, rescheduling_done)')
    .eq('role', 'bko')
  if (teamId) query = query.eq('team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
    .map((p) => ({ ...p, performance: p.performance ?? null }))
    .sort((a, b) => Number(b.performance?.commission || 0) - Number(a.performance?.commission || 0))
}

// ---------- escrita (supervisor apenas — RLS também garante isso no banco) ----------

export async function updatePerformance(userId, patch) {
  const { error } = await supabase
    .from('performance')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateProfile(userId, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}

// Troca só o nome de um perfil (10/11/2026). Passa pela função
// atualizar_nome_perfil (migration_049), que deixa o líder renomear BKO do
// time e cada pessoa renomear a si mesma, sem poder mexer em papel/time.
// Enquanto a migration_049 não tiver sido rodada no banco, a função não
// existe (erro PGRST202) e cai no update direto antigo.
export async function atualizarNomePerfil(userId, nome) {
  const { error } = await supabase.rpc('atualizar_nome_perfil', { p_user_id: userId, p_nome: nome })
  if (!error) return
  if (error.code === 'PGRST202') return updateProfile(userId, { name: nome })
  throw error
}

export async function updatePassword(userId, newPassword) {
  return updateLogin(userId, { password: newPassword })
}

// Troca o usuário (login) e/ou a senha de um BKO. O usuário PRECISA
// passar por aqui (não por updateProfile) porque o login de verdade é o
// e-mail no Supabase Auth — mudar só o profiles.username deixava a tela
// mostrando um usuário que não existia de fato no login.
export async function updateLogin(userId, { username, password } = {}) {
  // Chama a Edge Function "admin-set-password" diretamente por fetch (em vez
  // de supabase.functions.invoke) porque o gateway novo de Functions do
  // Supabase exige a chave "publishable" nova no header apikey — a chave
  // "anon" antiga usada pelo resto do app é rejeitada só nesse gateway.
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Sessão expirada, faça login novamente.')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-set-password`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, newPassword: password || undefined, newUsername: username || undefined }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Falha ao trocar login.')
}

// Descobre a operadora (Vivo/Claro/TIM) de um número de celular, via Edge
// Function (o navegador não consegue chamar o site de consulta direto —
// veja supabase/functions/consulta-operadora). numero: DDD + número, só
// dígitos. Devolve { operadora, operadoraBruta, portado }.
export async function consultarOperadora(numero) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Sessão expirada, faça login novamente.')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/consulta-operadora`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ numero }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) {
    // Sessão encerrada no servidor (ex: senha trocada): manda pro login.
    if (await encerrarSeSessaoMorta()) throw new Error('Sua sessão expirou. Entre de novo.')
  }
  if (!res.ok) throw new Error(body.error || 'Falha ao consultar operadora.')
  // Reforço do lado do site (10/11/2026): o consultaoperadora.com.br às
  // vezes devolve o nome da empresa dona da operadora, ex: "Telefônica
  // Brasil (M&oacute;vel/SMP)" (que é a Vivo), e a função do Supabase não
  // reconhecia. Decodifica os acentos e reconhece pelo nome da empresa.
  const bruta = decodificarHtml(body.operadoraBruta || '')
  return { ...body, operadoraBruta: bruta, operadora: body.operadora || normalizarOperadora(bruta) }
}

function decodificarHtml(texto) {
  const el = document.createElement('textarea')
  el.innerHTML = texto
  return el.value
}

export function normalizarOperadora(texto) {
  const s = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!s) return null
  if (s.includes('vivo') || s.includes('telefonica')) return 'VIVO'
  if (s.includes('claro') || s.includes('nextel')) return 'CLARO'
  if (/\btim\b/.test(s)) return 'TIM'
  if (/\boi\b/.test(s) || s.includes('telemar')) return 'OI'
  return null
}

// ---------- reagendamento: BKO manda direto quantos já fez ----------
// Simplificado em 05/11/2026 (Brayan: "muda para eles só precisarem
// mandar quantos eles fizeram") — sem CNPJ/Razão Social, só a
// quantidade. Cada envio já soma na meta/comissão na hora.

export async function fetchReagendamentoCasos({ bkoId, teamId } = {}) {
  let query = supabase
    .from('reagendamento_casos')
    .select(`*, profiles!reagendamento_casos_bko_id_fkey${teamId ? '!inner' : ''}(name, team_id)`)
    .order('criado_em', { ascending: false })
  if (bkoId) query = query.eq('bko_id', bkoId)
  if (teamId) query = query.eq('profiles.team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function registrarReagendamentoProprio(quantidade) {
  const { error } = await supabase.rpc('registrar_reagendamento_proprio', {
    p_quantidade: quantidade,
  })
  if (error) throw new Error(error.message || 'Falha ao registrar reagendamento.')
}

// Comprovante de fatura: cada envio já soma +1 fatura e +R$2 na
// comissão na hora (igual reagendamento).
export async function registrarComprovanteFatura(arquivoPath, arquivoUrl, observacao = '') {
  const { error } = await supabase.rpc('registrar_comprovante_fatura', {
    p_arquivo_path: arquivoPath,
    p_arquivo_url: arquivoUrl,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message || 'Falha ao registrar comprovante.')
}

// ---------- custcode de fatura: BKO manda, depois de 5 dias sem sair
// cai numa lista pra o supervisor verificar e marcar Saiu/Refazer ----------
export async function fetchCustcodesFatura({ bkoId, teamId } = {}) {
  let query = supabase
    .from('fatura_custcodes')
    .select(`*, profiles!fatura_custcodes_bko_id_fkey${teamId ? '!inner' : ''}(name, team_id)`)
    .order('enviado_em', { ascending: false })
  if (bkoId) query = query.eq('bko_id', bkoId)
  if (teamId) query = query.eq('profiles.team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function enviarCustcodeFatura(custcode) {
  const { error } = await supabase.rpc('enviar_custcode_fatura', { p_custcode: custcode })
  if (error) throw new Error(error.message || 'Falha ao enviar CustCode.')
}

export async function verificarCustcodeFatura(id, resultado) {
  const { error } = await supabase.rpc('verificar_custcode_fatura', { p_id: id, p_resultado: resultado })
  if (error) throw new Error(error.message || 'Falha ao verificar CustCode.')
}


// Configuração por módulo (fatura / contestacao / reagendamento) — os 3
// são abas da MESMA planilha "Controle de fatura", cada um com sua
// própria aba e mapeamento de coluna.
export async function fetchModuloConfig(modulo) {
  const { data, error } = await supabase
    .from('planilha_modulos_config')
    .select('*')
    .eq('modulo', modulo)
    .single()
  if (error) throw error
  return data
}

export async function updateModuloConfig(modulo, userId, patch) {
  const { error } = await supabase
    .from('planilha_modulos_config')
    .update({ ...patch, atualizado_por: userId, atualizado_em: new Date().toISOString() })
    .eq('modulo', modulo)
  if (error) throw error
}

// Aceita tanto o link inteiro (https://docs.google.com/spreadsheets/d/ID/edit...)
// quanto só o ID colado direto — extrai o ID dos dois jeitos.
export function extrairSpreadsheetId(urlOuId) {
  const texto = (urlOuId || '').trim()
  const match = texto.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : texto
}

// Lista as abas de uma planilha a partir do link (ou ID) colado no
// formulário — antes mesmo de salvar, pra dar pra escolher a aba certa
// num dropdown (como a automação do P2B).
export async function listarAbasPlanilha(sheetUrl) {
  const spreadsheetId = extrairSpreadsheetId(sheetUrl)
  if (!spreadsheetId) throw new Error('Cole o link da planilha primeiro.')
  const { abas } = await chamarSheetsFaturas({ action: 'listar_abas', spreadsheetId })
  return abas
}

// Chama a Edge Function "sheets-faturas" (lê/escreve na planilha Google
// Sheets "Controle de fatura") — mesmo jeito de chamar do updateLogin
// (fetch direto, chave "publishable" no apikey).
async function chamarSheetsFaturas(body) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Sessão expirada, faça login novamente.')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sheets-faturas`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
  const dados = await res.json().catch(() => ({}))
  if (!res.ok || dados.error) throw new Error(dados.error || 'Falha ao consultar a planilha.')
  return dados
}

// Letra da coluna do Google Sheets a partir do índice (0=A, 1=B, ...,
// 25=Z, 26=AA...).
function indiceParaColuna(indice) {
  let letra = ''
  let n = indice + 1
  while (n > 0) {
    const resto = (n - 1) % 26
    letra = String.fromCharCode(65 + resto) + letra
    n = Math.floor((n - 1) / 26)
  }
  return letra
}

// Lê a aba configurada inteira, acha o índice de cada coluna mapeada
// pelo NOME (cabeçalho, linha 1) e devolve cada linha já como objeto —
// guarda os índices junto (usados depois pra escrever de volta sem
// precisar reler o cabeçalho a cada vez).
export async function fetchPlanilhaLinhas(modulo) {
  const config = await fetchModuloConfig(modulo)
  if (!config.aba_nome) {
    return { config, colunas: null, linhas: [] }
  }

  const { valores } = await chamarSheetsFaturas({
    action: 'ler',
    intervalo: `${config.aba_nome}!A1:ZZ2000`,
    spreadsheetId: extrairSpreadsheetId(config.sheet_url) || undefined,
  })
  const todasLinhas = valores || []
  if (todasLinhas.length === 0) return { config, colunas: null, linhas: [] }

  const cabecalho = todasLinhas[0]
  // Normaliza espaços (inclusive não-quebráveis, comuns em texto colado
  // do Sheets) antes de comparar — nome da coluna configurado precisa
  // bater com o cabeçalho real, mas variações de espaço não devem
  // quebrar o match.
  const normalizar = (texto) => (texto || '').replace(/\s+/g, ' ').trim().toUpperCase()
  const acharColuna = (nome) =>
    cabecalho.findIndex((c) => normalizar(c) === normalizar(nome))

  const colunas = {
    nome: acharColuna(config.coluna_nome),
    cnpj: acharColuna(config.coluna_cnpj),
    custcode: acharColuna(config.coluna_custcode),
    telefone: acharColuna(config.coluna_telefone),
    status: acharColuna(config.coluna_status),
    protocolo: acharColuna(config.coluna_protocolo),
    vendedor: acharColuna(config.coluna_vendedor),
  }

  const pegar = (linha, indice) => (indice >= 0 ? linha[indice] || '' : '')

  const linhas = todasLinhas
    .slice(1)
    .map((linha, i) => ({
      linhaPlanilha: i + 2, // linha real na planilha (1 = cabeçalho)
      nome: pegar(linha, colunas.nome),
      cnpj: pegar(linha, colunas.cnpj),
      custcode: pegar(linha, colunas.custcode),
      telefone: pegar(linha, colunas.telefone),
      status: pegar(linha, colunas.status),
      protocolo: pegar(linha, colunas.protocolo),
      vendedor: pegar(linha, colunas.vendedor),
    }))
    .filter((l) => l.nome || l.cnpj || l.custcode)

  return { config, colunas, linhas }
}

// Escreve um campo (status ou protocolo) de volta na planilha, numa
// linha específica — usa o índice de coluna já resolvido por
// fetchFaturasLinhas (colunas.status / colunas.protocolo).
export async function escreverPlanilhaCampo(config, colunas, linhaPlanilha, campo, valor) {
  const indice = colunas[campo]
  if (indice == null || indice < 0) {
    throw new Error(`Coluna de "${campo}" não encontrada na planilha. Confira a configuração em Configurações.`)
  }
  const celula = `${config.aba_nome}!${indiceParaColuna(indice)}${linhaPlanilha}`
  await chamarSheetsFaturas({
    action: 'escrever',
    intervalo: celula,
    valor,
    spreadsheetId: extrairSpreadsheetId(config.sheet_url) || undefined,
  })
}

export async function fetchParcelamentoConfig() {
  const { data, error } = await supabase
    .from('parcelamento_config')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}

export async function updateParcelamentoConfig(userId, patch) {
  const { error } = await supabase
    .from('parcelamento_config')
    .update({ ...patch, atualizado_por: userId, atualizado_em: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}

export async function fetchParcelamentoLogin() {
  const { data, error } = await supabase
    .from('parcelamento_login')
    .select('usuario, criado_em')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}

export async function enviarParcelamentoLogin(userId, { usuario, token }) {
  const { error } = await supabase
    .from('parcelamento_login')
    .update({ usuario, token, criado_por: userId, criado_em: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}

export { usernameToEmail }

// ---------- planilha de vendas (10/11/2026) ----------
// Assim que a operação salva a ficha, escreve os dados do cliente numa
// linha nova da planilha configurada em Configurações > Planilha de
// vendas. As colunas são achadas pelo NOME no cabeçalho (linha 1), então
// a ordem das colunas na planilha não importa e colunas extras ficam em
// branco. Se a aba estiver vazia, cria o cabeçalho padrão abaixo.

// "11/11/2026 14:35" no horário de Brasília, igual pra todo mundo.
export function dataHoraVenda(quando) {
  return new Date(quando || Date.now()).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
}

const COLUNAS_VENDA = [
  // Data E hora em que a ficha foi salva (pedido do Brayan em 11/11/2026).
  { cabecalho: 'DATA', apelidos: ['DATA DA VENDA', 'DATA E HORA', 'DATA/HORA'], valor: (v) => dataHoraVenda(v.created_at) },
  { cabecalho: 'CNPJ', apelidos: [], valor: (v) => v.cnpj },
  { cabecalho: 'RAZÃO SOCIAL', apelidos: ['RAZAO SOCIAL', 'EMPRESA'], valor: (v) => v.razao_social },
  { cabecalho: 'NOME DO CLIENTE', apelidos: ['CLIENTE', 'NOME'], valor: (v) => v.nome_cliente },
  { cabecalho: 'CPF', apelidos: ['CPF DO CLIENTE'], valor: (v) => v.cpf_cliente },
  { cabecalho: 'NÚMERO', apelidos: ['NUMERO', 'TELEFONE', 'TEL', 'CELULAR', 'NUMERO DO CLIENTE'], valor: (v) => v.telefone_cliente },
  { cabecalho: 'OPERADORA', apelidos: ['OPERADORA DO NUMERO', 'OPERADORA DO CLIENTE'], valor: (v) => v.operadora_linha },
  { cabecalho: 'E-MAIL', apelidos: ['EMAIL', 'E MAIL'], valor: (v) => v.email_cliente },
  { cabecalho: 'ENDEREÇO', apelidos: ['ENDERECO', 'ENDERECO DE ENTREGA'], valor: (v) => v.endereco },
  { cabecalho: 'PONTO DE REFERÊNCIA', apelidos: ['PONTO DE REFERENCIA', 'REFERENCIA'], valor: (v) => v.ponto_referencia },
  { cabecalho: 'PLANO', apelidos: [], valor: (v) => v.plano },
  { cabecalho: 'QTD LINHAS', apelidos: ['QUANTIDADE DE LINHAS', 'LINHAS QTD', 'QTD'], valor: (v) => v.quantidade_linhas },
  { cabecalho: 'LINHAS', apelidos: ['DETALHE DAS LINHAS'], valor: (v) => resumoLinhas(v.linhas) },
  { cabecalho: 'OPERADOR', apelidos: ['QUEM FECHOU', 'QUEM FECHOU A VENDA', 'VENDEDOR'], valor: (v) => v.fechou_venda },
  // Supervisor fica na coluna captador do banco (11/11/2026); uma planilha
  // antiga com cabeçalho CAPTADOR continua recebendo esse valor.
  { cabecalho: 'SUPERVISOR', apelidos: ['CAPTADOR', 'CAPTADOR DA VENDA'], valor: (v) => v.captador },
]

function resumoLinhas(linhas) {
  return (linhas || [])
    .map((l, i) => {
      const chip = l.tipo_chip === 'esim' ? 'eSIM' : 'chip físico'
      if (l.tipo === 'portabilidade') {
        return `${i + 1}) Portabilidade ${l.numero || ''} (${l.operadora || l.operadora_bruta || '?'}), ${chip}, titular ${l.titular_nome || ''} ${l.titular_documento || ''}`.trim()
      }
      return `${i + 1}) Linha nova, ${chip}${l.operadora_origem ? `, vem da ${l.operadora_origem}` : ''}`
    })
    .join(' | ')
}

function normalizarCabecalho(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

export async function escreverVendaNaPlanilha(venda) {
  const config = await fetchModuloConfig('vendas').catch(() => null)
  if (!config?.aba_nome) return { configurada: false }
  const spreadsheetId = extrairSpreadsheetId(config.sheet_url) || undefined
  const aba = config.aba_nome

  const { valores } = await chamarSheetsFaturas({ action: 'ler', intervalo: `${aba}!A1:ZZ5000`, spreadsheetId })
  let cabecalho = (valores && valores[0]) || []
  let proximaLinha = Math.max((valores || []).length, 1) + 1

  // Aba vazia: escreve o cabeçalho padrão na linha 1.
  if (!cabecalho.some((c) => String(c || '').trim())) {
    cabecalho = COLUNAS_VENDA.map((c) => c.cabecalho)
    await Promise.all(cabecalho.map((titulo, i) =>
      chamarSheetsFaturas({ action: 'escrever', intervalo: `${aba}!${indiceParaColuna(i)}1`, valor: titulo, spreadsheetId })
    ))
    proximaLinha = 2
  }

  const cabecalhoNorm = cabecalho.map(normalizarCabecalho)
  const escritas = []
  for (const col of COLUNAS_VENDA) {
    const nomes = [col.cabecalho, ...col.apelidos].map(normalizarCabecalho)
    const indice = cabecalhoNorm.findIndex((c) => nomes.includes(c))
    if (indice < 0) continue
    const valor = col.valor(venda)
    if (valor === null || valor === undefined || valor === '') continue
    // Apóstrofo na frente de números longos (CPF, CNPJ, telefone) pro
    // Sheets não transformar em número e comer os zeros da frente.
    const texto = typeof valor === 'string' && /^[\d.\-/]{8,}$/.test(valor) ? `'${valor}` : valor
    escritas.push(chamarSheetsFaturas({
      action: 'escrever',
      intervalo: `${aba}!${indiceParaColuna(indice)}${proximaLinha}`,
      valor: texto,
      spreadsheetId,
    }))
  }
  if (escritas.length === 0) {
    throw new Error(`Nenhuma coluna da aba "${aba}" bate com os dados da venda (ex: CNPJ, NOME DO CLIENTE, CPF, NÚMERO, E-MAIL).`)
  }
  await Promise.all(escritas)

  // Marca a venda como enviada (colunas da migration_050; se ela ainda não
  // foi rodada, só ignora).
  if (venda.id) {
    await supabase.from('vendas_cnpj').update({ na_planilha: true, linha_planilha: proximaLinha }).eq('id', venda.id)
  }
  return { configurada: true, linha: proximaLinha, aba }
}
