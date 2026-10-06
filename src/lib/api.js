import { supabase, usernameToEmail } from './supabaseClient'

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

// ---------- registro diário (só reagendamento — contestação agora exige aprovação) ----------

export async function submitDailyReport(reagendamentos) {
  const { error } = await supabase.rpc('submit_daily_report', { p_reagendamentos: reagendamentos })
  if (error) throw new Error(error.message || 'Falha ao enviar registro diário.')
}

// Relatório do BKO (aba única): reagendamentos, contestações e faturas —
// basta um dos três. Só reagendamento soma na meta/comissão.
export async function submitRelatorio({ reagendamentos = 0, contestacoes = 0, faturas = 0 }) {
  const { error } = await supabase.rpc('submit_relatorio_diario', {
    p_reagendamentos: reagendamentos,
    p_contestacoes: contestacoes,
    p_faturas: faturas,
  })
  if (error) throw new Error(error.message || 'Falha ao enviar o relatório.')
}

// ---------- reagendamento: fila de casos (CNPJ + Razão Social) ----------
// Substitui o antigo "digita quantos fez hoje" — agora o supervisor/
// líder manda o caso pro BKO, que marca como feito quando resolve (só aí
// conta na meta/comissão).

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

export async function adicionarReagendamentoCaso(bkoId, cnpj, razaoSocial, custcode = '') {
  const { error } = await supabase.rpc('adicionar_reagendamento_caso', {
    p_bko_id: bkoId,
    p_cnpj: cnpj,
    p_razao_social: razaoSocial,
    p_custcode: custcode,
  })
  if (error) throw new Error(error.message || 'Falha ao adicionar caso.')
}

export async function concluirReagendamentoCaso(id) {
  const { error } = await supabase.rpc('concluir_reagendamento_caso', { p_id: id })
  if (error) throw new Error(error.message || 'Falha ao concluir caso.')
}

export async function fetchTeamRelatorios(teamId) {
  let query = supabase
    .from('daily_reports')
    .select(`*, profiles!daily_reports_user_id_fkey${teamId ? '!inner' : ''}(name, team_id)`)
    .order('created_at', { ascending: false })
    .limit(200)
  if (teamId) query = query.eq('profiles.team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ---------- contestações (fluxo de aprovação) ----------

export async function submitContestacao(custCode, observacao) {
  const { error } = await supabase.rpc('submit_contestacao', {
    p_cust_code: custCode,
    p_observacao: observacao || '',
  })
  if (error) throw new Error(error.message || 'Falha ao enviar contestação.')
}

export async function decideContestacao(id, status, motivo) {
  const { error } = await supabase.rpc('decide_contestacao', {
    p_id: id,
    p_status: status,
    p_motivo: motivo || null,
  })
  if (error) throw new Error(error.message || 'Falha ao registrar decisão.')
}

export async function fetchOwnContestacoes(userId) {
  const { data, error } = await supabase
    .from('contestacoes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Mesma regra de teamId do fetchTeam — precisa do !inner pro filtro na
// tabela relacionada (profiles.team_id) funcionar.
export async function fetchTeamContestacoes(teamId) {
  let query = supabase
    .from('contestacoes')
    .select(`*, profiles!contestacoes_user_id_fkey${teamId ? '!inner' : ''}(name, team_id)`)
    .order('created_at', { ascending: false })
  if (teamId) query = query.eq('profiles.team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ---------- contestações da planilha (módulo "Contestação (Faturas)") ----------
// Histórico de quando cada Cust Code apareceu na aba de Contestação e
// quando saiu dela (resolvido no sistema do TIM, pode levar até ~10 dias)
// — separado do fluxo de aprovação acima (contestacoes/submit_contestacao).

// Chamada ao abrir a tela de Contestação (Faturas) — registra quem é novo
// na aba e marca quem sumiu dela como "saído agora". Falha aqui nunca
// deve travar a tela (é só histórico), então os chamadores engolem erro.
export async function sincronizarContestacaoSheet(linhasAtivas) {
  const comCustcode = linhasAtivas.filter((l) => l.custcode)
  const { error } = await supabase.rpc('sincronizar_contestacao_sheet', {
    p_custcodes_ativos: comCustcode.map((l) => l.custcode),
    p_nomes: comCustcode.map((l) => l.nome || ''),
  })
  if (error) throw new Error(error.message || 'Falha ao sincronizar contestações.')
}

// Relatório do mês atual (enviadas desde o dia 1) — "reset mensal" é só
// filtrar por data, nada é apagado, então os que ainda estão em trânsito
// na virada do mês continuam rastreados até saírem de verdade.
export async function fetchContestacaoSheetRelatorioMes(teamId) {
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  let query = supabase
    .from('contestacao_sheet_envios')
    .select(`*, profiles!contestacao_sheet_envios_user_id_fkey${teamId ? '!inner' : ''}(name, team_id)`)
    .gte('enviado_em', inicioMes.toISOString())
    .order('enviado_em', { ascending: false })
  if (teamId) query = query.eq('profiles.team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// Lista dos últimos ~14 dias ainda sem saiu_em — a "lista da última
// semana" que não pode sumir na virada do mês, já que pode levar até 10
// dias pra sair do sistema.
export async function fetchContestacaoSheetPendentesRecentes(teamId) {
  const limite = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  let query = supabase
    .from('contestacao_sheet_envios')
    .select(`*, profiles!contestacao_sheet_envios_user_id_fkey${teamId ? '!inner' : ''}(name, team_id)`)
    .is('saiu_em', null)
    .gte('enviado_em', limite.toISOString())
    .order('enviado_em', { ascending: false })
  if (teamId) query = query.eq('profiles.team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
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
  if (!spreadsheetId) throw new Error('Cola o link da planilha primeiro.')
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
    throw new Error(`Coluna de "${campo}" não encontrada na planilha — confere a configuração em Automações.`)
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

// ---------- casos do WhatsApp (fila do bot) ----------

export async function fetchCasosWhatsapp() {
  const { data, error } = await supabase
    .from('whatsapp_casos')
    .select('*, profiles!whatsapp_casos_pego_por_fkey(name)')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data
}

export async function pegarCasoWhatsapp(id) {
  const { data, error } = await supabase.rpc('whatsapp_pegar_caso', { p_id: id })
  if (error) throw new Error(error.message || 'Esse caso já foi pego por outra pessoa.')
  return data
}

export { usernameToEmail }
