import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import CarImage from '../components/game/CarImage'

const LANES = 3
const CANVAS_W = 360
const CANVAS_H = 560
const LANE_W = CANVAS_W / LANES
const CAR_Y = CANVAS_H - 110 // topo da hitbox do carro do jogador
const SCALE = 2 // pixels na tela por "metro" de progresso

// Curva de dificuldade: os obstáculos começam espaçados e vão ficando mais
// apertados conforme a distância aumenta, até um mínimo (nunca impossível).
const GAP_INICIAL = 260
const GAP_MINIMO = 120
const QUEDA_POR_METRO = 0.022
// A partir daqui, começa a chance de bloquear uma 2ª pista na mesma fileira
// (nunca as três — sempre sobra um caminho livre).
const DUPLA_INICIO = 500
const DUPLA_RAMPA = 3000
const DUPLA_MAX = 0.5

function recordeKey(userId) {
  return `corrida_recorde_${userId || 'anon'}`
}

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

// Pista infinita: gera fileiras de obstáculos sob demanda conforme o
// jogador avança, sempre puxando da mesma sequência de números aleatórios
// (determinística pela seed), então dois jogadores do mesmo racha veem
// exatamente a mesma pista, por mais longe que cheguem.
function criarPista(seed) {
  const rng = mulberry32(seed)
  const obstaculos = []
  let geradoAte = 260

  function gap(distancia) {
    return Math.max(GAP_MINIMO, GAP_INICIAL - distancia * QUEDA_POR_METRO)
  }

  function garantirAte(distanciaAlvo) {
    while (geradoAte < distanciaAlvo) {
      geradoAte += gap(geradoAte)
      const lane = Math.floor(rng() * LANES)
      obstaculos.push({ distancia: geradoAte, lane })

      const chanceDupla = Math.min(DUPLA_MAX, Math.max(0, (geradoAte - DUPLA_INICIO) / DUPLA_RAMPA))
      if (rng() < chanceDupla) {
        let lane2 = Math.floor(rng() * LANES)
        if (lane2 === lane) lane2 = (lane2 + 1) % LANES
        obstaculos.push({ distancia: geradoAte + 22, lane: lane2 })
      }
    }
  }

  function limparAtras(distancia) {
    while (obstaculos.length && obstaculos[0].distancia < distancia - 120) obstaculos.shift()
  }

  return { obstaculos, garantirAte, limparAtras }
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
  const [estado, setEstado] = useState('pronto') // pronto | contagem | correndo | bateu
  const [contagem, setContagem] = useState(3)
  const [distanciaFinal, setDistanciaFinal] = useState(null)
  const [recorde, setRecorde] = useState(0)
  const [resultadoDesafio, setResultadoDesafio] = useState(null) // 'ganhou' | 'perdeu' | 'empate' | 'aguardando'

  useEffect(() => {
    if (!profile?.id) return
    const salvo = Number(localStorage.getItem(recordeKey(profile.id)) || 0)
    setRecorde(salvo)

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
    const pista = criarPista(seed)

    let carLane = 1 // 0, 1, 2
    let carX = LANE_W * carLane + LANE_W / 2
    let targetX = carX
    let progresso = 0
    const velocidadeBase = 3 + speedBonus * 0.25
    const agilidade = 0.18 + handlingBonus * 0.012 // resposta do volante ao trocar de pista
    let curvaOffset = 0
    let curvaDir = 1
    let rodando = true

    function velocidadeAtual() {
      return velocidadeBase * Math.min(1.9, 1 + progresso * 0.00025)
    }

    function onKey(e) {
      if (e.key === 'ArrowLeft') { carLane = Math.max(0, carLane - 1); targetX = carLane * LANE_W + LANE_W / 2 }
      if (e.key === 'ArrowRight') { carLane = Math.min(LANES - 1, carLane + 1); targetX = carLane * LANE_W + LANE_W / 2 }
    }
    window.addEventListener('keydown', onKey)

    function desenharCone(x, y) {
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,.28)'
      ctx.beginPath()
      ctx.ellipse(x, y + 16, 15, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = '#ff7a1a'
      ctx.beginPath()
      ctx.moveTo(x, y - 16)
      ctx.lineTo(x + 14, y + 14)
      ctx.lineTo(x - 14, y + 14)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.35)'
      ctx.beginPath()
      ctx.moveTo(x - 2, y - 14)
      ctx.lineTo(x + 2, y - 14)
      ctx.lineTo(x - 5, y + 13)
      ctx.lineTo(x - 9, y + 13)
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
      ctx.fillStyle = cor2
      ctx.beginPath()
      ctx.roundRect(x - 17, y, 34, 54, 8)
      ctx.fill()
      ctx.restore()

      // brilho sutil no capô pra dar volume à carroceria
      const grad = ctx.createLinearGradient(x - 17, y, x + 17, y)
      grad.addColorStop(0, 'rgba(255,255,255,.22)')
      grad.addColorStop(0.5, 'rgba(255,255,255,0)')
      grad.addColorStop(1, 'rgba(0,0,0,.12)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x - 17, y, 34, 54, 8)
      ctx.fill()

      ctx.fillStyle = '#1b2430'
      ctx.beginPath()
      ctx.roundRect(x - 12, y + 8, 24, 16, 4)
      ctx.fill()
      ctx.fillStyle = '#ffe9a8'
      ctx.fillRect(x - 14, y + 2, 5, 4)
      ctx.fillRect(x + 9, y + 2, 5, 4)
      ctx.fillStyle = '#111'
      ctx.fillRect(x - 20, y + 8, 5, 12)
      ctx.fillRect(x + 15, y + 8, 5, 12)
      ctx.fillRect(x - 20, y + 34, 5, 12)
      ctx.fillRect(x + 15, y + 34, 5, 12)
    }

    function desenharFundo(dificuldade) {
      // grama nas laterais — moldura verde fixa em volta da pista
      ctx.fillStyle = '#2f7d3a'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

      // asfalto, com leve gradiente pra sugerir profundidade (mais claro
      // longe, mais escuro perto — efeito de "neblina" bem sutil)
      const MARGEM = 10
      const asfalto = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
      asfalto.addColorStop(0, '#4d5158')
      asfalto.addColorStop(1, '#34373c')
      ctx.fillStyle = asfalto
      ctx.fillRect(MARGEM, 0, CANVAS_W - MARGEM * 2, CANVAS_H)
      ctx.fillStyle = 'rgba(255,255,255,.045)'
      ctx.fillRect(curvaOffset, 0, CANVAS_W, CANVAS_H)

      // acostamento (faixas vermelho/branco), fixo na borda da grama
      const faixa = 8
      for (let y = -20; y < CANVAS_H + 20; y += 30) {
        const off = ((y + progresso * SCALE) % 60 < 30) ? '#e5e5e5' : '#c62828'
        ctx.fillStyle = off
        ctx.fillRect(MARGEM - faixa, y, faixa, 20)
        ctx.fillRect(CANVAS_W - MARGEM, y, faixa, 20)
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

      // linhas de velocidade nas laterais — ficam mais fortes conforme a
      // dificuldade (e a velocidade) sobem, reforçando a sensação de ritmo
      if (dificuldade > 0.15) {
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + dificuldade * 0.18})`
        ctx.lineWidth = 2
        for (let y = -40; y < CANVAS_H + 40; y += 46) {
          const yy = (y + progresso * SCALE * (1.6 + dificuldade)) % (CANVAS_H + 80) - 40
          ctx.beginPath()
          ctx.moveTo(8, yy)
          ctx.lineTo(8, yy + 20)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(CANVAS_W - 8, yy)
          ctx.lineTo(CANVAS_W - 8, yy + 20)
          ctx.stroke()
        }
      }

      // brilho no horizonte, no topo da tela
      const ceu = ctx.createLinearGradient(0, 0, 0, 60)
      ceu.addColorStop(0, 'rgba(255,255,255,.10)')
      ceu.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = ceu
      ctx.fillRect(0, 0, CANVAS_W, 60)
    }

    function loop() {
      if (!rodando) return
      const v = velocidadeAtual()
      progresso += v
      const dificuldade = Math.min(1, progresso / 6000)
      curvaOffset += curvaDir * (0.35 + dificuldade * 0.15)
      if (Math.abs(curvaOffset) > 30) curvaDir *= -1

      carX += (targetX - carX) * agilidade

      desenharFundo(dificuldade)

      pista.garantirAte(progresso + CANVAS_H / SCALE + 100)
      pista.limparAtras(progresso)

      let bateu = false
      const carLaneAtual = Math.round((carX - LANE_W / 2) / LANE_W)
      pista.obstaculos.forEach((o) => {
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
      ctx.fillText(`${Math.floor(progresso)}m`, 10, 22)

      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = 'rgba(255,255,255,.75)'
      ctx.fillText('DIFICULDADE', CANVAS_W - 96, 16)
      ctx.strokeStyle = 'rgba(255,255,255,.5)'
      ctx.strokeRect(CANVAS_W - 96, 20, 86, 6)
      ctx.fillStyle = dificuldade > 0.7 ? '#ff5252' : dificuldade > 0.35 ? '#ffb74d' : '#66bb6a'
      ctx.fillRect(CANVAS_W - 96, 20, 86 * dificuldade, 6)

      if (bateu) {
        rodando = false
        window.removeEventListener('keydown', onKey)
        setDistanciaFinal(Math.floor(progresso))
        setEstado('bateu')
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

  // Guarda o recorde pessoal (só pista livre, sem racha — o racha compara
  // contra o adversário, não faz sentido comparar com seu próprio recorde).
  useEffect(() => {
    if (race || estado !== 'bateu' || distanciaFinal == null || !profile?.id) return
    if (distanciaFinal > recorde) {
      localStorage.setItem(recordeKey(profile.id), String(distanciaFinal))
      setRecorde(distanciaFinal)
    }
  }, [estado, race, distanciaFinal, recorde, profile?.id])

  // Grava o resultado do desafio (distância percorrida até bater) e, se o
  // outro lado já correu, decide quem foi mais longe.
  useEffect(() => {
    if (!race || estado !== 'bateu' || distanciaFinal == null) return
    const souChallenger = race.challenger_id === profile.id
    const campoDistancia = souChallenger ? 'challenger_time' : 'opponent_time'
    const campoBateu = souChallenger ? 'challenger_bateu' : 'opponent_bateu'

    supabase.from('races').update({ [campoDistancia]: distanciaFinal, [campoBateu]: true }).eq('id', race.id).then(async () => {
      const { data: fresh } = await supabase.from('races').select('*').eq('id', race.id).single()
      if (!fresh || fresh.status !== 'aceita') return

      const meuLadoTerminou = souChallenger ? fresh.challenger_time != null : fresh.opponent_time != null
      const outroLadoTerminou = souChallenger ? fresh.opponent_time != null : fresh.challenger_time != null

      if (!meuLadoTerminou || !outroLadoTerminou) {
        setResultadoDesafio('aguardando')
        return
      }

      let winnerId = null
      if (fresh.challenger_time > fresh.opponent_time) winnerId = fresh.challenger_id
      else if (fresh.opponent_time > fresh.challenger_time) winnerId = fresh.opponent_id
      // distâncias iguais: empate, winnerId fica null

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
  }, [estado, race, profile?.id, distanciaFinal])

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
            <div className="text-xs font-medium text-brand-600">⚔️ Racha contra {oponente} — {race.wager_points} pts, vale quem for mais longe</div>
          ) : (
            <div className="text-xs text-muted">
              Use ← → pra desviar dos obstáculos — a pista é infinita e fica mais difícil com a distância
              {recorde > 0 && <> · Recorde: {recorde}m</>}
            </div>
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
            <div className="text-sm">Distância: {distanciaFinal}m{!race && distanciaFinal === recorde && distanciaFinal > 0 && ' — novo recorde! 🏆'}</div>
            {race ? (
              <ResultadoDesafio resultado={resultadoDesafio} wager={race.wager_points} />
            ) : (
              <button className="btn-primary" onClick={() => setEstado('pronto')}>Tentar de novo</button>
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
        <div className="text-sm">Esperando o outro lado correr pra saber quem foi mais longe…</div>
        <Link to="../desafios" className="btn-primary">Voltar pros desafios</Link>
      </>
    )
  }
  const texto = resultado === 'empate' ? 'Empate — os dois foram até a mesma distância, ninguém ganha nem perde pontos.'
    : resultado === 'ganhou' ? `Você foi mais longe e ganhou o racha! +${wager} pts 🏆`
    : `Você perdeu o racha. -${wager} pts`
  return (
    <>
      <div className="text-sm font-medium">{texto}</div>
      <Link to="../desafios" className="btn-primary">Voltar pros desafios</Link>
    </>
  )
}
