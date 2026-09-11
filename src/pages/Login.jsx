import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { homeFor } from '../lib/ProtectedRoute'
import { supabaseConfigured } from '../lib/supabaseClient'

export default function Login() {
  const { signIn, profile, loading } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const eyeRef = useRef(null)
  const pupilRef = useRef(null)
  const lidRef = useRef(null)
  const closedRef = useRef(false)

  useEffect(() => {
    function onMove(e) {
      const eye = eyeRef.current
      const pupil = pupilRef.current
      if (!eye || !pupil || closedRef.current) return
      const r = eye.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const d = Math.hypot(dx, dy) || 1
      const maxX = 42
      const maxY = 22
      const k = Math.min(1, d / 420)
      pupil.style.transform = `translate(${(dx / d) * maxX * k}px, ${(dy / d) * maxY * k}px)`
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  function closeEye() {
    closedRef.current = true
    const lid = lidRef.current
    const pupil = pupilRef.current
    if (pupil) pupil.style.transform = 'translate(0,0)'
    if (lid) {
      lid.style.animation = 'none'
      lid.style.transition = 'transform .3s ease'
      lid.style.transform = 'translateY(0)'
    }
  }

  function openEye() {
    closedRef.current = false
    const lid = lidRef.current
    if (lid) {
      lid.style.transform = 'translateY(-110%)'
      setTimeout(() => {
        if (lidRef.current && !closedRef.current) {
          lidRef.current.style.transition = ''
          lidRef.current.style.animation = 'bkoBlink 5.5s ease-in-out infinite'
        }
      }, 320)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: signInError } = await signIn(username, password)
    setSubmitting(false)
    if (signInError) setError(signInError)
  }

  useEffect(() => {
    if (!loading && profile) navigate(homeFor(profile.role), { replace: true })
  }, [loading, profile, navigate])

  if (!loading && profile) return <Navigate to={homeFor(profile.role)} replace />

  return (
    <div className="grid min-h-screen font-sans text-ink" style={{ gridTemplateColumns: '1.05fr .95fr' }}>
      {/* coluna vermelha — o olho */}
      <div
        className="relative flex flex-col items-center justify-center gap-8 overflow-hidden text-white"
        style={{ padding: '52px 64px', background: 'linear-gradient(155deg,#b42318 0%,#8a1b12 55%,#5c120c 100%)' }}
      >
        <span
          className="absolute rounded-full"
          style={{ top: -90, left: -70, width: 340, height: 340, background: 'rgba(255,255,255,.08)', animation: 'bkoDrift 14s ease-in-out infinite' }}
        />
        <span
          className="absolute rounded-full"
          style={{ bottom: -120, right: -60, width: 280, height: 280, background: 'rgba(255,255,255,.06)', animation: 'bkoDrift 18s ease-in-out infinite reverse' }}
        />

        <div className="relative flex items-center gap-3.5 self-start" style={{ animation: 'bkoRise .5s ease both' }}>
          <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] border border-white/35 bg-white/16 text-[15px] font-bold">BKO</div>
          <span className="text-[15px] font-medium tracking-wide opacity-90">Painel operacional</span>
        </div>

        <div className="relative flex flex-col items-center gap-6" style={{ animation: 'bkoRise .6s .1s ease both' }}>
          <div
            className="relative flex items-center justify-center"
            style={{ width: 230, height: 230, animation: 'bkoFloatEye 6s ease-in-out infinite' }}
          >
            <span className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(255,255,255,.45)', animation: 'bkoRing 3.4s ease-out infinite' }} />
            <span className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(255,255,255,.3)', animation: 'bkoRing 3.4s 1.7s ease-out infinite' }} />
            <div
              ref={eyeRef}
              className="relative flex items-center justify-center overflow-hidden bg-white"
              style={{ width: 210, height: 132, borderRadius: '50%/50%', boxShadow: 'inset 0 -10px 26px rgba(90,10,8,.22), 0 18px 40px rgba(50,5,5,.35)' }}
            >
              <div
                ref={pupilRef}
                className="flex items-center justify-center rounded-full"
                style={{ width: 74, height: 74, background: 'radial-gradient(circle at 34% 30%, #5c626f 0%, #1d2029 60%, #0d0f14 100%)', transition: 'transform .16s ease-out' }}
              >
                <span className="rounded-full bg-white/90" style={{ width: 22, height: 22, transform: 'translate(-12px,-14px)' }} />
              </div>
              <span
                ref={lidRef}
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg,#b42318,#5c120c)', transform: 'translateY(-110%)', animation: 'bkoBlink 5.5s ease-in-out infinite' }}
              />
            </div>
          </div>
          <div className="flex max-w-[420px] flex-col items-center gap-2.5 text-center">
            <span className="text-[27px] font-semibold leading-tight tracking-tight">Alguém está de olho nos números</span>
            <span className="text-sm leading-relaxed opacity-80">
              Comissão, contestação e reagendamento em um só lugar. Entre para ver o resultado da equipe de hoje.
            </span>
          </div>
        </div>
      </div>

      {/* coluna do formulário */}
      <div className="flex items-center justify-center bg-paper" style={{ padding: '64px 56px' }}>
        <form
          onSubmit={handleSubmit}
          className="card flex w-full flex-col gap-5 p-8"
          style={{ maxWidth: 380 }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xl font-semibold tracking-tight text-ink">Entrar</span>
            <span className="text-sm text-muted">Use seu acesso corporativo</span>
          </div>

          {!supabaseConfigured && (
            <div className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-xs text-warn-text">
              Supabase não configurado. Preencha o arquivo <code>.env</code> (veja <code>.env.example</code>).
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="username">Usuário</label>
            <input
              id="username"
              className="field-input"
              placeholder="nome.sobrenome"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="field-input"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={closeEye}
              onBlur={openEye}
            />
            <span className="mt-1.5 block text-xs text-subtle">O olho fecha enquanto você digita a senha.</span>
          </div>

          {error && <div className="text-sm font-medium text-bad-text">{error}</div>}

          <button type="submit" className="btn-primary" style={{ animation: 'bkoGlowBtn 3.4s ease-in-out infinite' }} disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar no painel'}
          </button>
        </form>
      </div>
    </div>
  )
}
