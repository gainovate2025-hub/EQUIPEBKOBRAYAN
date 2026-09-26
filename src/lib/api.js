import { supabase, usernameToEmail } from './supabaseClient'

// ---------- leitura ----------

// teamId opcional: supervisor com equipe vinculada (ex: Brayan, na
// "Equipe Brayan") vê só o próprio time; sem equipe vinculada (contas
// de admin geral, como supervisao/will) continua vendo todo mundo.
export async function fetchTeam(teamId) {
  let query = supabase
    .from('profiles')
    .select('id, name, username, role, active, performance(*)')
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
