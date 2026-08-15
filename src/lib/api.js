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
  // Requer privilégio de admin (service_role). Alteração de senha de outro
  // usuário só pode ser feita por uma função de servidor (Edge Function) —
  // aqui expomos o ponto de extensão; sem a function, lança erro amigável.
  const { error } = await supabase.functions.invoke('admin-set-password', {
    body: { userId, newPassword },
  })
  if (error) throw new Error('Troca de senha requer a Edge Function "admin-set-password" publicada no Supabase.')
}

export async function addNote(userId, note) {
  const { error } = await supabase.from('notes').insert({ user_id: userId, note })
  if (error) throw error
}

export async function deleteNote(noteId) {
  const { error } = await supabase.from('notes').delete().eq('id', noteId)
  if (error) throw error
}

export { usernameToEmail }
