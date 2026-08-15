// Edge Function: admin-set-password
// Permite que o Supervisor troque a senha de um BKO sem expor a
// service_role key no frontend. Rode no ambiente do Supabase (Deno).
//
// Deploy:
//   supabase functions deploy admin-set-password
//
// A função usa o service_role key interno do projeto (variável de
// ambiente já disponível automaticamente em toda Edge Function do
// Supabase) e valida, antes de tudo, que quem está chamando é o
// supervisor autenticado — nunca confia em nada vindo do cliente.

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
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'supervisor') {
      return new Response(JSON.stringify({ error: 'Apenas o supervisor pode trocar senhas.' }), { status: 403 })
    }

    const { userId, newPassword } = await req.json()
    if (!userId || !newPassword || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Dados inválidos.' }), { status: 400 })
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 400 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
