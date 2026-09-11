import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import CarImage from '../components/game/CarImage'

const LANES = 3
const TRACK_LENGTH = 2000 // "metros" até a chegada
const CANVAS_W = 360
const CANVAS_H = 560
const LANE_W = CANVAS_W / LANES
const CAR_Y = CANVAS_H - 110 // topo da hitbox do carro do jogador
const SCALE = 2 // pixels na tela por "metro" de progresso

// PRNG determinística: com a mesma seed, gera sempre a mesma sequência.
// Usada pra dois jogadores desafiados caírem exatamente na mesma pista.
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Pista com poucos obstáculos bem espaçados (curados pela seed), em vez de
// gerar aleatoriamente a cada frame — fica justo pros dois lados do desafio
// e não enche a pista de obstáculo em cima do outro.
function gerarObstaculos(seed) {
  const rng = mulberry32(seed)
  const linhas = 6
  const inicioFrac = 0.2
  const fimFrac = 0.85
  const obstaculos = []
  for (let i = 0; i < linhas; i++) {
    const frac = inicioFrac + (i / (linhas - 1)) * (fimFrac - inicioFrac)
    const jitter = (rng() - 0.5) * 0.04
    const distancia = (frac + jitter) * TRACK_LENGTH
    const lane = Math.floor(rng() * LANES)
    obstaculos.push({ distancia, lane })
    if (i === linhas - 1) {
      let lane2 = Math.floor(rng() * LANES)
      if (lane2 === lane) lane2 = (lane2 + 1) % LANES
      obstaculos.push({ distancia: distancia + 26, lane: lane2 })
    }
  }
  return obstaculos
}

export default function Corrida() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const desafioId = searchParams.get('desafio')
  const canvasRef = useRef(null)
  const [equipado, setEquipado] = useState(null)
  const [bonus, setBonus] = useState({ velocidade: 0, curva: 0 })
  const [race, setRace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [estado, setEstado] = useState('pronto') // pronto | contagem | correndo | venceu | bateu
  const [contagem, setContagem] = useState(3)
  const [tempoFinal, setTempoFinal] = useState(null)
  const [resultadoDesafio, setResultadoDesafio] = useState(null) // 'ganhou' | 'perdeu' | 'empate' | 'aguardando'

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('bko_cars')
      .select('*, cars(*)')
      .eq('user_id', profile.id)
      .eq('is_equipped', true)
      .maybeSingle()
      .then(async ({ data }) => {
        setEquipado(data)
        if (data) {
          const { data: ups } = await supabase
            .from('bko_car_upgrades')
            .select('*, car_upgrades(*)')
            .eq('bko_car_id', data.id)
          const total = { velocidade: 0, curva: 0 }
          ;(ups || []).forEach((u) => { total[u.car_upgrades.type] += u.car_upgrades.bonus })
          setBonus(total)
        }

        if (desafioId) {
          const { data: r, error } = await supabase
            .from('races')
            .select('*, challenger:profiles!races_challenger_id_fkey(name), opponent:profiles!races_opponent_id_fkey(name)')
            .eq('id', desafioId)
            .single()
          if (error || !r) {
            setErro('Desafio não encontrado.')
          } else if (r.status !== 'aceita') {
            setErro('Esse desafio não está mais disponível pra correr.')
          } else if (r.challenger_id !== profile.id && r.opponent_id !== profile.id) {
            setErro('Esse desafio não é seu.')
          } else {
            const souChallenger = r.challenger_id === profile.id
            const jaCorri = souChallenger ? (r.challenger_time != null || r.challenger_bateu) : (r.opponent_time != null || r.opponent_bateu)
            if (jaCorri) {
              setErro('Você já correu esse desafio. É só esperar o outro lado correr.')
            }
            setRace(r)
          }
        }
        setLoading(false)
      })
  }, [profile?.id, desafioId])

  const startGame = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const speedBonus = (equipado?.cars?.base_speed ?? 5) + bonus.velocidade
    const handlingBonus = (equipado?.cars?.base_handling ?? 5) + bonus.curva
    const cor = equipado?.color || '#c62828'

    const seed = race ? race.track_seed : Math.floor(Math.random() * 1e9)
    const obstaculos = gerarObstaculos(seed)

    let carLane = 1 // 0, 1, 2
    let carX = LANE_W * carLane + LANE_W / 2
    let targetX = carX
    let progresso = 0
    const velocidade = 3 + speedBonus * 0.25 // "metros" por frame
    const agilidade = 0.18 + handlingBonus * 0.012 // resposta do volante ao trocar de pista
    let curvaOffset = 0
    let curvaDir = 1
    let rodando = true
    const inicio = performance.now()

    function onKey(e) {
      if (e.key === 'ArrowLeft') { carLane = Math.max(0, carLane - 1); targetX = carLane * LANE_W + LANE_W / 2 }
      if (e.key === 'ArrowRight') { carLane = Math.min(LANES - 1, carLane + 1); targetX = carLane * LANE_W + LANE_W / 2 }
    }
    window.addEventListener('keydown', onKey)

    function desenharCone(x, y) {
      ctx.fillStyle = '#ff7a1a'
      ctx.beginPath()
      ctx.moveTo(x, y - 16)
      ctx.lineTo(x + 14, y + 14)
      ctx.lineTo(x - 14, y + 14)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillRect(x - 12, y + 2, 24, 4)
      ctx.fillStyle = '#c4470a'
      ctx.fillRect(x - 15, y + 13, 30, 4)
    }

    function desenharCarro(x, y, cor2) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,.4)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 3
      // carroceria
      ctx.fillStyle = cor2
      ctx.beginPath()
      ctx.roundRect(x - 17, y, 34, 54, 8)
      ctx.fill()
      ctx.restore()
      // para-brisa
      ctx.fillStyle = '#1b2430'
      ctx.beginPath()
      ctx.roundRect(x - 12, y + 8, 24, 16, 4)
      ctx.fill()
      // faróis
      ctx.fillStyle = '#ffe9a8'
      ctx.fillRect(x - 14, y + 2, 5, 4)
      ctx.fillRect(x + 9, y + 2, 5, 4)
      // rodas
      ctx.fillStyle = '#111'
      ctx.fillRect(x - 20, y + 8, 5, 12)
      ctx.fillRect(x + 15, y + 8, 5, 12)
      ctx.fillRect(x - 20, y + 34, 5, 12)
      ctx.fillRect(x + 15, y + 34, 5, 12)
    }

    function desenharFundo() {
      // asfalto
      ctx.fillStyle = '#3a3d42'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.fillStyle = '#46494f'
      ctx.fillRect(curvaOffset, 0, CANVAS_W, CANVAS_H)

      // acostamento (faixas vermelho/branco nas bordas da pista)
      const faixa = 10
      for (let y = -20; y < CANVAS_H + 20; y += 30) {
        const off = ((y + progresso * SCALE) % 60 < 30) ? '#e5e5e5' : '#c62828'
        ctx.fillStyle = off
        ctx.fillRect(curvaOffset - faixa, y, faixa, 20)
        ctx.fillRect(curvaOffset + CANVAS_W, y, faixa, 20)
      }

      // faixas centrais tracejadas
      ctx.strokeStyle = 'rgba(255,255,255,.85)'
      ctx.lineWidth = 3
      ctx.setLineDash([18, 18])
      ctx.lineDashOffset = -progresso * SCALE
      for (let i = 1; i < LANES; i++) {
        ctx.beginPath()
        ctx.moveTo(curvaOffset + i * LANE_W, 0)
        ctx.lineTo(curvaOffset + i * LANE_W, CANVAS_H)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    function loop() {
      if (!rodando) return
      progresso += velocidade
      curvaOffset += curvaDir * 0.35
      if (Math.abs(curvaOffset) > 30) curvaDir *= -1

      carX += (targetX - carX) * agilidade

      desenharFundo()

      // linha de chegada quadriculada, no fim da pista
      const yChegada = CAR_Y + (progresso - TRACK_LENGTH) * SCALE + 54
      if (yChegada > -20 && yChegada < CANVAS_H + 20) {
        for (let cx = 0; cx < CANVAS_W; cx += 18) {
          ctx.fillStyle = ((cx / 18) % 2 === 0) ? '#eee' : '#222'
          ctx.fillRect(curvaOffset + cx, yChegada, 18, 14)
        }
      }

      // obstáculos (posição fixa no "mundo", calculada a partir do progresso)
      let bateu = false
      const carLaneAtual = Math.round((carX - LANE_W / 2) / LANE_W)
      obstaculos.forEach((o) => {
        const y = CAR_Y + (progresso - o.distancia) * SCALE + 54
        if (y > -40 && y < CANVAS_H + 40) {
          desenharCone(curvaOffset + o.lane * LANE_W + LANE_W / 2, y)
        }
        if (o.lane === carLaneAtual && y > CAR_Y - 20 && y < CAR_Y + 60) bateu = true
      })

      desenharCarro(carX, CAR_Y, cor)

      // HUD
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px monospace'
      ctx.fillText(`${Math.min(100, Math.floor((progresso / TRACK_LENGTH) * 100))}%`, 10, 22)

      if (bateu) {
        rodando = false
        window.removeEventListener('keydown', onKey)
        setEstado('bateu')
        return
      }
      if (progresso >= TRACK_LENGTH) {
        rodando = false
        window.removeEventListener('keydown', onKey)
        setTempoFinal(((performance.now() - inicio) / 1000).toFixed(1))
        setEstado('venceu')
        return
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)

    return () => {
      rodando = false
      window.removeEventListener('keydown', onKey)
    }
  }, [equipado, bonus, race])

  // Grava o resultado do desafio e, se o outro lado já correu, decide o vencedor.
  useEffect(() => {
    if (!race || (estado !== 'venceu' && estado !== 'bateu')) return
    const souChallenger = race.challenger_id === profile.id
    const campoTempo = souChallenger ? 'challenger_time' : 'opponent_time'
    const campoBateu = souChallenger ? 'challenger_bateu' : 'opponent_bateu'
    const patch = estado === 'venceu' ? { [campoTempo]: Number(tempoFinal) } : { [campoBateu]: true }

    supabase.from('races').update(patch).eq('id', race.id).then(async () => {
      const { data: fresh } = await supabase.from('races').select('*').eq('id', race.id).single()
      if (!fresh || fresh.status !== 'aceita') return

      const meuLadoTerminou = souChallenger ? (fresh.challenger_time != null || fresh.challenger_bateu) : (fresh.opponent_time != null || fresh.opponent_bateu)
      const outroLadoTerminou = souChallenger ? (fresh.opponent_time != null || fresh.opponent_bateu) : (fresh.challenger_time != null || fresh.challenger_bateu)

      if (!meuLadoTerminou || !outroLadoTerminou) {
        setResultadoDesafio('aguardando')
        return
      }

      let winnerId = null
      if (!fresh.challenger_bateu && !fresh.opponent_bateu) {
        winnerId = fresh.challenger_time <= fresh.opponent_time ? fresh.challenger_id : fresh.opponent_id
      } else if (fresh.challenger_bateu && !fresh.opponent_bateu) {
        winnerId = fresh.opponent_id
      } else if (!fresh.challenger_bateu && fresh.opponent_bateu) {
        winnerId = fresh.challenger_id
      } // se os dois bateram: empate, winnerId fica null

      const loserId = winnerId === fresh.challenger_id ? fresh.opponent_id : fresh.challenger_id
      await supabase.from('races').update({ status: 'concluida', winner_id: winnerId, finished_at: new Date().toISOString() }).eq('id', race.id)
      if (winnerId) {
        await supabase.from('game_wallet_transactions').insert([
          { user_id: winnerId, type: 'aposta_ganha', amount: fresh.wager_points, ref_id: race.id },
          { user_id: loserId, type: 'aposta_perdida', amount: -fresh.wager_points, ref_id: race.id },
        ])
      }
      setResultadoDesafio(!winnerId ? 'empate' : winnerId === profile.id ? 'ganhou' : 'perdeu')
    })
  }, [estado, race, profile?.id, tempoFinal])

  function iniciar() {
    setEstado('contagem')
    setContagem(3)
  }

  useEffect(() => {
    if (estado !== 'contagem') return
    if (contagem === 0) {
      setEstado('correndo')
      setTimeout(startGame, 50)
      return
    }
    const t = setTimeout(() => setContagem((c) => c - 1), 700)
    return () => clearTimeout(t)
  }, [estado, contagem, startGame])

  if (loading) return <p className="text-sm text-muted">Carregando…</p>
  if (erro) {
    return (
      <div className="card p-6">
        <p className="text-sm text-muted">{erro}</p>
        <Link to="../desafios" className="btn-ghost mt-3 inline-block">Voltar pros desafios</Link>
      </div>
    )
  }
  if (!equipado) {
    return (
      <div className="card p-6">
        <p className="text-sm text-muted">Você precisa equipar um carro na Garagem antes de correr.</p>
      </div>
    )
  }

  const oponente = race ? (race.challenger_id === profile.id ? race.opponent.name : race.challenger.name) : null

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="card flex items-center gap-3 p-4">
        <CarImage name={equipado.cars.name} size={72} />
        <div className="text-left">
          <div className="text-sm font-medium">{equipado.cars.name}</div>
          <div className="text-xs text-muted">
            Velocidade {(equipado.cars.base_speed + bonus.velocidade)} · Curva {(equipado.cars.base_handling + bonus.curva)}
          </div>
          {race ? (
            <div className="text-xs font-medium text-brand-600">⚔️ Racha contra {oponente} — {race.wager_points} pts</div>
          ) : (
            <div className="text-xs text-muted">Use ← → pra trocar de pista e desviar dos obstáculos</div>
          )}
        </div>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="rounded-lg border border-line" />
        {estado === 'pronto' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <button className="btn-primary" onClick={iniciar}>Começar corrida</button>
          </div>
        )}
        {estado === 'contagem' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-5xl font-bold text-white">{contagem > 0 ? contagem : 'VAI!'}</div>
          </div>
        )}
        {estado === 'bateu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
            <div className="text-lg font-bold">Bateu! 💥</div>
            {race ? (
              <ResultadoDesafio resultado={resultadoDesafio} wager={race.wager_points} />
            ) : (
              <button className="btn-primary" onClick={() => setEstado('pronto')}>Tentar de novo</button>
            )}
          </div>
        )}
        {estado === 'venceu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
            <div className="text-lg font-bold">Chegou! 🏁</div>
            <div className="text-sm">Tempo: {tempoFinal}s</div>
            {race ? (
              <ResultadoDesafio resultado={resultadoDesafio} wager={race.wager_points} />
            ) : (
              <button className="btn-primary" onClick={() => setEstado('pronto')}>Correr de novo</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultadoDesafio({ resultado, wager }) {
  if (!resultado || resultado === 'aguardando') {
    return (
      <>
        <div className="text-sm">Esperando o outro lado correr pra saber quem ganhou…</div>
        <Link to="../desafios" className="btn-primary">Voltar pros desafios</Link>
      </>
    )
  }
  const texto = resultado === 'empate' ? 'Empate — os dois bateram, ninguém ganha nem perde pontos.'
    : resultado === 'ganhou' ? `Você ganhou o racha! +${wager} pts 🏆`
    : `Você perdeu o racha. -${wager} pts`
  return (
    <>
      <div className="text-sm font-medium">{texto}</div>
      <Link to="../desafios" className="btn-primary">Voltar pros desafios</Link>
    </>
  )
}
