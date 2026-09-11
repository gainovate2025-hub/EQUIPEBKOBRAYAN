import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Desafios() {
  const { profile } = useAuth()
  const isGestor = profile?.role === 'supervisor' || profile?.role === 'lider'
  const [teammates, setTeammates] = useState([])
  const [saldo, setSaldo] = useState(0)
  const [races, setRaces] = useState([])
  const [opponentId, setOpponentId] = useState('')
  const [wager, setWager] = useState(50)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    // lista de quem dá pra desafiar: colegas do mesmo time; supervisor (sem
    // time fixo) pode desafiar qualquer bko/líder da empresa.
    let teamQuery = supabase.from('profiles').select('id, name, username').neq('id', profile.id).in('role', ['bko', 'lider']).order('name')
    if (profile.team_id) teamQuery = teamQuery.eq('team_id', profile.team_id)

    // pontos: bko ganha 1 por contestação própria; supervisor/líder ganham
    // 1 a cada 10 contestações da equipe (mesma regra da Garagem).
    const perfPromise = isGestor
      ? supabase.from('profiles').select('performance(contestations_done)').eq('role', 'bko')
      : supabase.from('performance').select('contestations_done').eq('user_id', profile.id).maybeSingle()

    const [teamRes, perfRes, walletRes, racesRes] = await Promise.all([
      teamQuery,
      perfPromise,
      supabase.from('game_wallet_transactions').select('amount').eq('user_id', profile.id),
      supabase
        .from('races')
        .select('*, challenger:profiles!races_challenger_id_fkey(name), opponent:profiles!races_opponent_id_fkey(name)')
        .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
        .order('created_at', { ascending: false }),
    ])
    setTeammates(teamRes.data || [])
    const contestacoes = isGestor
      ? (perfRes.data || []).reduce((sum, p) => sum + (p.performance?.contestations_done ?? 0), 0)
      : (perfRes.data?.contestations_done ?? 0)
    const pontosGanhos = isGestor ? Math.floor(contestacoes / 10) : contestacoes
    const gasto = (walletRes.data || []).reduce((sum, t) => sum + t.amount, 0)
    setSaldo(pontosGanhos + gasto)
    setRaces(racesRes.data || [])
    setLoading(false)
  }, [profile?.id, profile?.team_id, isGestor])

  useEffect(() => { load() }, [load])

  async function desafiar() {
    setMsg('')
    if (!opponentId) return setMsg('Escolhe alguém pra desafiar.')
    if (wager <= 0) return setMsg('A aposta precisa ser maior que 0.')
    if (wager > saldo) return setMsg('Você não tem pontos suficientes pra essa aposta.')

    const { error } = await supabase.from('races').insert({
      challenger_id: profile.id,
      opponent_id: opponentId,
      wager_points: wager,
      track_seed: Math.floor(Math.random() * 1e9),
      status: 'pendente',
    })
    if (error) return setMsg('Erro: ' + error.message)
    setMsg('Desafio enviado!')
    setOpponentId('')
    load()
  }

  async function aceitar(race) {
    if (race.wager_points > saldo) return setMsg('Você não tem pontos suficientes pra aceitar essa aposta.')
    await supabase.from('races').update({ status: 'aceita' }).eq('id', race.id)
    load()
  }

  async function recusar(race) {
    await supabase.from('races').update({ status: 'recusada' }).eq('id', race.id)
    load()
  }

  async function cancelar(race) {
    await supabase.from('races').delete().eq('id', race.id)
    load()
  }

  if (loading) return <p className="text-sm text-muted">Carregando…</p>

  const recebidos = races.filter((r) => r.status === 'pendente' && r.opponent_id === profile.id)
  const enviados = races.filter((r) => r.status === 'pendente' && r.challenger_id === profile.id)
  const emAndamento = races.filter((r) => r.status === 'aceita')
  const historico = races.filter((r) => r.status === 'concluida' || r.status === 'recusada')

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex items-center justify-between p-6">
        <div>
          <div className="text-sm text-muted">Seus pontos</div>
          <div className="text-3xl font-bold">{saldo} pts</div>
        </div>
        <Link to="../garagem" className="btn-ghost">🚗 Garagem</Link>
      </div>

      {msg && <p className="text-sm font-medium text-brand-600">{msg}</p>}

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold">Chamar alguém pra correr</h2>
        {teammates.length === 0 ? (
          <p className="text-sm text-muted">Não tem mais ninguém na sua equipe pra desafiar ainda.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Quem</label>
              <select className="field-input" value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
                <option value="">Escolher...</option>
                {teammates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Aposta (pts)</label>
              <input
                type="number"
                min={1}
                className="field-input w-28"
                value={wager}
                onChange={(e) => setWager(Number(e.target.value))}
              />
            </div>
            <button className="btn-primary" onClick={desafiar}>⚔️ Desafiar</button>
          </div>
        )}
      </div>

      {recebidos.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Te chamaram pra correr</h2>
          <div className="flex flex-col gap-2">
            {recebidos.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                <span><strong>{r.challenger.name}</strong> te desafiou por {r.wager_points} pts</span>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm" onClick={() => aceitar(r)}>Aceitar</button>
                  <button className="btn-ghost btn-sm" onClick={() => recusar(r)}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {enviados.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Desafios que você mandou</h2>
          <div className="flex flex-col gap-2">
            {enviados.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                <span>Esperando <strong>{r.opponent.name}</strong> responder — {r.wager_points} pts</span>
                <button className="btn-ghost btn-sm" onClick={() => cancelar(r)}>Cancelar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {emAndamento.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Corridas valendo pontos</h2>
          <div className="flex flex-col gap-2">
            {emAndamento.map((r) => {
              const souChallenger = r.challenger_id === profile.id
              const oponente = souChallenger ? r.opponent.name : r.challenger.name
              const jaCorri = souChallenger ? (r.challenger_time != null || r.challenger_bateu) : (r.opponent_time != null || r.opponent_bateu)
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                  <span>Contra <strong>{oponente}</strong> — {r.wager_points} pts</span>
                  {jaCorri ? (
                    <span className="text-xs text-muted">Aguardando {oponente} correr…</span>
                  ) : (
                    <Link className="btn-primary btn-sm" to={`../corrida?desafio=${r.id}`}>🏁 Correr</Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Histórico</h2>
          <div className="flex flex-col gap-2">
            {historico.map((r) => {
              const souChallenger = r.challenger_id === profile.id
              const oponente = souChallenger ? r.opponent.name : r.challenger.name
              if (r.status === 'recusada') {
                return <div key={r.id} className="rounded-lg border border-line p-3 text-sm text-muted">Desafio contra {oponente} foi recusado.</div>
              }
              const empate = !r.winner_id
              const venci = r.winner_id === profile.id
              return (
                <div key={r.id} className={`rounded-lg border p-3 text-sm ${empate ? 'border-line' : venci ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                  Contra <strong>{oponente}</strong> — {empate ? 'Empate (os dois bateram)' : venci ? `Você ganhou ${r.wager_points} pts 🏆` : `Você perdeu ${r.wager_points} pts`}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
