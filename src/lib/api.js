import { supabase, usernameToEmail } from './supabaseClient'

// ---------- leitura ----------

export async function fetchTeam() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username, role, active, performance(*)')
    .eq('role', 'bko')
    .order('name', { ascending: true })
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

export async function fetchNotesFor(userId) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchAllNotes() {
  const { data, error } = await supabase
    .from('notes')
    .select('*, profiles!notes_user_id_fkey(name)')
    .order('created_at', { ascending: false })
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

export async function fetchTeamRanking() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username, performance(commission, contestations_done, rescheduling_done)')
    .eq('role', 'bko')
  if (error) throw error
  return data
    .map((p) => ({ ...p, performance: p.performance ?? null }))
    .sort((a, b) => Number(b.performance?.commission || 0) - Number(a.performance?.commission || 0))
}

export async function fetchAllTeams() {
  const { data, error } = await supabase.from('teams').select('id, name').order('name')
  if (error) throw error
  return data
}

export async function fetchTeamMessages(teamId) {
  const { data, error } = await supabase
    .from('team_messages')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function postTeamMessage(teamId, message) {
  const { error } = await supabase.rpc('post_team_message', { p_team_id: teamId, p_message: message })
  if (error) throw new Error(error.message || 'Falha ao enviar mensagem.')
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
      body: JSON.stringify({ userId, newPassword }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Falha ao trocar senha.')
}

export async function addNote(userId, note) {
  const { error } = await supabase.from('notes').insert({ user_id: userId, note })
  if (error) throw error
}

export async function deleteNote(noteId) {
  const { error } = await supabase.from('notes').delete().eq('id', noteId)
  if (error) throw error
}

// ---------- registro diário (só reagendamento — contestação agora exige aprovação) ----------

export async function submitDailyReport(reagendamentos) {
  const { error } = await supabase.rpc('submit_daily_report', { p_reagendamentos: reagendamentos })
  if (error) throw new Error(error.message || 'Falha ao enviar registro diário.')
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

export async function fetchTeamContestacoes() {
  const { data, error } = await supabase
    .from('contestacoes')
    .select('*, profiles!contestacoes_user_id_fkey(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export { usernameToEmail }
