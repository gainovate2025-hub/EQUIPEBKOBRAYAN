import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Logo from '../components/ui/Logo'
import { useAuth } from '../lib/AuthContext'
import { homeFor } from '../lib/ProtectedRoute'
import { supabaseConfigured } from '../lib/supabaseClient'

export default function Login() {
  const { signIn, profile, loading } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(true)
  const [ajudaSenha, setAjudaSenha] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    localStorage.setItem('bko_lembrar', lembrar ? '1' : '0')
    const { error: signInError } = await signIn(username, password)
    setSubmitting(false)
    if (signInError) setError(signInError)
  }

  useEffect(() => {
    if (!loading && profile) navigate(homeFor(profile.role), { replace: true })
  }, [loading, profile, navigate])

  if (!loading && profile) return <Navigate to={homeFor(profile.role)} replace />

  return (
    <div className="grid min-h-screen bg-paper font-sans text-ink lg:grid-cols-[45fr_55fr]">
      {/* painel azul-marinho na esquerda — some em telas pequenas */}
      <div className="hidden flex-col justify-between border-r-4 border-brand-400 bg-sidebar px-14 py-12 lg:flex">
        <Logo size={30} />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-white">Painel BKO</h1>
          <p className="text-sm text-sidebar-text">Faturas, comprovantes, reagendamentos, CustCode, Crivo e vendas da equipe.</p>
        </div>
        <span className="text-xs text-sidebar-textMuted">Uso interno da equipe BKO</span>
      </div>

      {/* formulário */}
      <div className="flex flex-col items-center justify-center gap-8 px-6 py-12 sm:px-10">
        <div className="flex w-full max-w-[380px] items-center rounded-md bg-sidebar px-4 py-3 lg:hidden">
          <Logo size={22} />
        </div>

        <form onSubmit={handleSubmit} className="card flex w-full max-w-[380px] flex-col gap-5 p-8">
          <div className="flex flex-col gap-1 border-l-4 border-brand-400 pl-3">
            <span className="text-xl font-bold text-sidebar">Entrar</span>
            <span className="text-sm text-muted">Use o usuário e a senha que o supervisor passou pra você.</span>
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
            <div className="relative">
              <input
                id="password"
                type={mostrarSenha ? 'text' : 'password'}
                className="field-input pr-10"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-line accent-brand-600"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
              />
              Lembrar de mim
            </label>
            <button
              type="button"
              onClick={() => setAjudaSenha((v) => !v)}
              className="text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Esqueci minha senha
            </button>
          </div>
          {ajudaSenha && (
            <p className="-mt-2 text-xs text-muted">Fale com seu supervisor ou líder pra redefinir sua senha.</p>
          )}

          {error && <div className="text-sm font-medium text-bad-text">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
