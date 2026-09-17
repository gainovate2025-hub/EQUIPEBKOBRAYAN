// Edge Function: admin-set-password
// Permite que o Supervisor (qualquer BKO) ou um Líder (só o próprio time)
// troque a senha e/ou o usuário (login) de um BKO sem expor a
// service_role key no frontend.
//
// IMPORTANTE sobre o usuário: o login real (auth.users.email) e o
// "profiles.username" mostrado na tela precisam mudar JUNTOS — antes só
// o profiles.username era atualizado (direto pelo cliente, sem passar
// aqui), então a tela mostrava um usuário novo que não existia de
// verdade no login (auth.users.email continuava o antigo). Por isso o
// troca de usuário agora só acontece aqui, atualizando os dois de uma
// vez.
// Rode no ambiente do Supabase (Deno).
//
// Deploy:
//   supabase functions deploy admin-set-password
//
// A função usa o service_role key interno do projeto (variável de
// ambiente já disponível automaticamente em toda Edge Function do
// Supabase) e valida, antes de tudo, quem está chamando — nunca confia
// em nada vindo do cliente.

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Cliente com o token do chamador, só para descobrir quem ele é.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401 })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, team_id')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'supervisor' && callerProfile?.role !== 'lider') {
      return new Response(JSON.stringify({ error: 'Apenas supervisor ou líder podem trocar senhas.' }), { status: 403 })
    }

    const { userId, newPassword, newUsername } = await req.json()
    if (!userId || (!newPassword && !newUsername)) {
      return new Response(JSON.stringify({ error: 'Dados inválidos.' }), { status: 400 })
    }
    if (newPassword && newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Senha muito curta.' }), { status: 400 })
    }
    const usernameLimpo = newUsername ? newUsername.trim().toLowerCase() : null
    if (newUsername && !usernameLimpo) {
      return new Response(JSON.stringify({ error: 'Usuário inválido.' }), { status: 400 })
    }

    // líder só pode trocar a senha de alguém do próprio time
    if (callerProfile.role === 'lider') {
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('team_id')
        .eq('id', userId)
        .single()
      if (!targetProfile || targetProfile.team_id !== callerProfile.team_id) {
        return new Response(JSON.stringify({ error: 'Você só pode trocar a senha de alguém do seu time.' }), { status: 403 })
      }
    }

    const authUpdate = {}
    if (newPassword) authUpdate.password = newPassword
    if (usernameLimpo) authUpdate.email = `${usernameLimpo}@painelbko.internal`

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, authUpdate)
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 400 })
    }

    if (usernameLimpo) {
      const { error: profileError } = await admin
        .from('profiles')
        .update({ username: usernameLimpo })
        .eq('id', userId)
      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), { status: 400 })
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
