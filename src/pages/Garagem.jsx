import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import CarImage from '../components/game/CarImage'

const CORES = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#212121', '#ffffff', '#ff6f00']

const RARITY_LABEL = { comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário' }
const RARITY_COLOR = {
  comum: 'text-muted',
  raro: 'text-blue-600',
  epico: 'text-purple-600',
  lendario: 'text-amber-600',
}

export default function Garagem() {
  const { profile } = useAuth()
  const isGestor = profile?.role === 'supervisor' || profile?.role === 'lider'
  const [contestacoesTime, setContestacoesTime] = useState(0)
  const [performance, setPerformance] = useState(null)
  const [cars, setCars] = useState([])
  const [owned, setOwned] = useState([])
  const [upgrades, setUpgrades] = useState([])
  const [ownedUpgrades, setOwnedUpgrades] = useState([])
  const [spent, setSpent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [carAbertoId, setCarAbertoId] = useState(null) // qual carro está com "melhorias" aberto
  const [corAbertoId, setCorAbertoId] = useState(null) // qual carro está com "trocar cor" aberto

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
    // supervisor/líder ganham pontos pela equipe (RLS já limita ao time certo);
    // bko ganha pelo próprio desempenho.
    const perfPromise = isGestor
      ? supabase.from('profiles').select('performance(contestations_done)').eq('role', 'bko')
      : supabase.from('performance').select('contestations_done').eq('user_id', profile.id).maybeSingle()

    const [perfRes, carsRes, ownedRes, upgradesRes, walletRes] = await Promise.all([
      perfPromise,
      supabase.from('cars').select('*').order('price_points', { ascending: true }),
      supabase.from('bko_cars').select('*, cars(*)').eq('user_id', profile.id),
      supabase.from('car_upgrades').select('*').order('price_points', { ascending: true }),
      supabase.from('game_wallet_transactions').select('amount').eq('user_id', profile.id),
    ])
    if (isGestor) {
      const total = (perfRes.data || []).reduce((sum, p) => sum + (p.performance?.contestations_done ?? 0), 0)
      setContestacoesTime(total)
    } else {
      setPerformance(perfRes.data)
    }
    setCars(carsRes.data || [])
    setOwned(ownedRes.data || [])
    setUpgrades(upgradesRes.data || [])
    setSpent((walletRes.data || []).reduce((sum, t) => sum + t.amount, 0))

    const ownedCarIds = (ownedRes.data || []).map((o) => o.id)
    if (ownedCarIds.length > 0) {
      const { data: ou } = await supabase.from('bko_car_upgrades').select('*').in('bko_car_id', ownedCarIds)
      setOwnedUpgrades(ou || [])
    } else {
      setOwnedUpgrades([])
    }
    } catch (err) {
      console.error('Garagem load falhou:', err)
      setMsg('Erro ao carregar: ' + (err.message || String(err)))
    }
    setLoading(false)
  }, [profile?.id, isGestor])

  useEffect(() => { load() }, [load])

  const contestacoes = isGestor ? contestacoesTime : (performance?.contestations_done ?? 0)
  const pontosGanhos = isGestor ? Math.floor(contestacoesTime / 10) : contestacoes
  const saldo = pontosGanhos + spent // spent já vem negativo nas compras
  const ownedIds = new Set(owned.map((o) => o.car_id))

  async function comprar(car) {
    setMsg('')
    if (saldo < car.price_points) return setMsg('Pontos insuficientes.')
    if (contestacoes < car.min_contestacoes) return setMsg(`Precisa de ${car.min_contestacoes} contestações pra desbloquear esse carro.`)

    const { data: novo, error: e1 } = await supabase
      .from('bko_cars')
      .insert({ user_id: profile.id, car_id: car.id })
      .select()
      .single()
    if (e1) return setMsg('Erro: ' + e1.message)

    const { error: e2 } = await supabase.from('game_wallet_transactions').insert({
      user_id: profile.id,
      type: 'compra_carro',
      amount: -car.price_points,
      ref_id: novo.id,
    })
    if (e2) return setMsg('Erro: ' + e2.message)

    setMsg(`"${car.name}" comprado!`)
    load()
  }

  async function equipar(bkoCarId) {
    await supabase.from('bko_cars').update({ is_equipped: false }).eq('user_id', profile.id)
    await supabase.from('bko_cars').update({ is_equipped: true }).eq('id', bkoCarId)
    load()
  }

  async function mudarCor(bkoCarId, cor) {
    await supabase.from('bko_cars').update({ color: cor }).eq('id', bkoCarId)
    load()
  }

  async function comprarUpgrade(bkoCarId, upgrade) {
    setMsg('')
    if (saldo < upgrade.price_points) return setMsg('Pontos insuficientes.')

    const { error: e1 } = await supabase.from('bko_car_upgrades').insert({ bko_car_id: bkoCarId, upgrade_id: upgrade.id })
    if (e1) return setMsg(e1.code === '23505' ? 'Você já tem essa melhoria nesse carro.' : 'Erro: ' + e1.message)

    const { error: e2 } = await supabase.from('game_wallet_transactions').insert({
      user_id: profile.id,
      type: 'compra_melhoria',
      amount: -upgrade.price_points,
      ref_id: bkoCarId,
    })
    if (e2) return setMsg('Erro: ' + e2.message)

    setMsg(`"${upgrade.name}" instalada!`)
    load()
  }

  if (loading) return <p className="text-sm text-muted">Carregando…</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex items-center justify-between p-6">
        <div>
          <div className="text-sm text-muted">Seus pontos</div>
          <div className="text-3xl font-bold">{saldo} pts</div>
          <div className="mt-1 text-xs text-muted">
            {isGestor
              ? `1 ponto a cada 10 contestações da equipe — total de ${contestacoes} contestações`
              : `1 ponto por contestação resolvida — total de ${contestacoes} contestações`}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="../desafios" className="btn-ghost">⚔️ Desafios</Link>
          <Link to="../corrida" className="btn-primary">🏁 Correr</Link>
        </div>
      </div>

      {msg && <p className="text-sm font-medium text-brand-600">{msg}</p>}

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold">Minha garagem</h2>
        {owned.length === 0 && <p className="text-sm text-muted">Você ainda não tem nenhum carro. Compra um na loja abaixo.</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {owned.map((o) => {
            const upgradesDoCarro = ownedUpgrades.filter((ou) => ou.bko_car_id === o.id)
            const aberto = carAbertoId === o.id
            const corAberta = corAbertoId === o.id
            return (
              <div key={o.id} className={`rounded-lg border p-3 text-center ${o.is_equipped ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                <div
                  className="mb-2 flex aspect-square items-center justify-center rounded bg-gray-100"
                  style={{ boxShadow: `inset 0 0 0 3px ${o.color || '#c62828'}` }}
                >
                  <CarImage name={o.cars.name} size={90} />
                </div>
                <div className="text-sm font-medium">{o.cars.name}</div>
                <div className={`text-xs ${RARITY_COLOR[o.cars.rarity]}`}>{RARITY_LABEL[o.cars.rarity]}</div>
                <div className="mt-1 text-[11px] text-muted">{upgradesDoCarro.length} melhoria(s) instalada(s)</div>
                {!o.is_equipped && (
                  <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => equipar(o.id)}>Usar</button>
                )}
                {o.is_equipped && <div className="mt-2 text-xs font-medium text-red-600">Em uso</div>}
                <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => setCorAbertoId(corAberta ? null : o.id)}>
                  {corAberta ? 'Fechar cores' : 'Modificar cor'}
                </button>
                {corAberta && (
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5 border-t border-line pt-2">
                    {CORES.map((cor) => (
                      <button
                        key={cor}
                        onClick={() => mudarCor(o.id, cor)}
                        className={`h-5 w-5 rounded-full border-2 ${o.color === cor ? 'border-brand-600' : 'border-transparent'}`}
                        style={{ backgroundColor: cor }}
                        aria-label={cor}
                      />
                    ))}
                  </div>
                )}
                <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => setCarAbertoId(aberto ? null : o.id)}>
                  {aberto ? 'Fechar melhorias' : 'Ver melhorias'}
                </button>

                {aberto && (
                  <div className="mt-3 space-y-2 border-t border-line pt-3 text-left">
                    {upgrades.map((u) => {
                      const jaTem = upgradesDoCarro.some((ou) => ou.upgrade_id === u.id)
                      return (
                        <div key={u.id} className="flex items-center justify-between gap-2 text-xs">
                          <span>{u.name} <span className="text-muted">({u.price_points} pts)</span></span>
                          {jaTem ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <button
                              className="btn-primary btn-sm"
                              disabled={saldo < u.price_points}
                              onClick={() => comprarUpgrade(o.id, u)}
                            >
                              Comprar
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold">Loja de carros</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cars.filter((c) => !ownedIds.has(c.id)).map((c) => {
            const bloqueado = contestacoes < c.min_contestacoes
            const semPontos = saldo < c.price_points
            return (
              <div key={c.id} className="rounded-lg border border-gray-200 p-3 text-center">
                <div className="mb-2 flex aspect-square items-center justify-center rounded bg-gray-100">
                  <CarImage name={c.name} size={90} />
                </div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className={`text-xs ${RARITY_COLOR[c.rarity]}`}>{RARITY_LABEL[c.rarity]}</div>
                <div className="mt-1 text-xs text-muted">{c.price_points} pts</div>
                {bloqueado && <div className="mt-1 text-[11px] text-muted">Precisa de {c.min_contestacoes} contestações</div>}
                <button
                  className="btn-primary btn-sm mt-2 w-full"
                  disabled={bloqueado || semPontos}
                  onClick={() => comprar(c)}
                >
                  Comprar
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
