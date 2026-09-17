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

// CORS: o site (GitHub Pages) e essa função vivem em domínios diferentes,
// então o navegador manda um pedido OPTIONS de "preflight" antes do POST
// de verdade — sem responder ele com esses cabeçalhos, o navegador barra
// tudo com um erro de rede genérico (tipo "Failed to fetch"), antes
// disso aqui sequer rodar.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
      return resposta({ error: 'Não autenticado.' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, team_id')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'supervisor' && callerProfile?.role !== 'lider') {
      return resposta({ error: 'Apenas supervisor ou líder podem trocar senhas.' }, 403)
    }

    const { userId, newPassword, newUsername } = await req.json()
    if (!userId || (!newPassword && !newUsername)) {
      return resposta({ error: 'Dados inválidos.' }, 400)
    }
    if (newPassword && newPassword.length < 6) {
      return resposta({ error: 'Senha muito curta.' }, 400)
    }
    const usernameLimpo = newUsername ? newUsername.trim().toLowerCase() : null
    if (newUsername && !usernameLimpo) {
      return resposta({ error: 'Usuário inválido.' }, 400)
    }

    // líder só pode trocar a senha de alguém do próprio time
    if (callerProfile.role === 'lider') {
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('team_id')
        .eq('id', userId)
        .single()
      if (!targetProfile || targetProfile.team_id !== callerProfile.team_id) {
        return resposta({ error: 'Você só pode trocar a senha de alguém do seu time.' }, 403)
      }
    }

    const authUpdate = {}
    if (newPassword) authUpdate.password = newPassword
    if (usernameLimpo) authUpdate.email = `${usernameLimpo}@painelbko.internal`

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, authUpdate)
    if (updateError) {
      return resposta({ error: updateError.message }, 400)
    }

    if (usernameLimpo) {
      const { error: profileError } = await admin
        .from('profiles')
        .update({ username: usernameLimpo })
        .eq('id', userId)
      if (profileError) {
        return resposta({ error: profileError.message }, 400)
      }
    }

    return resposta({ ok: true })
  } catch (err) {
    return resposta({ error: String(err) }, 500)
  }
})
