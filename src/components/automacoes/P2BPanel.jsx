import { useEffect, useRef, useState } from 'react'

// Fala direto com o backend do P2B (repositório separado, hospedado no
// Render) — em vez de mandar a pessoa pro site próprio do P2B, escolhe a
// planilha e liga a automação aqui mesmo. O trabalho pesado (abrir o
// Phoenix2Business e consultar CUST CODE) continua rodando na extensão
// Chrome instalada localmente; esse painel só liga/desliga e mostra o
// progresso.
const API_URL = import.meta.env.VITE_P2B_API_URL || 'https://p2b-automation-backend.onrender.com'

async function chamar(caminho, options = {}) {
  const res = await fetch(`${API_URL}${caminho}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(corpo.error || `Falha (${res.status})`)
  return corpo
}

const STATUS_TEXTO = {
  idle: 'Parado',
  running: 'Rodando',
  paused: 'Pausado',
  stopped: 'Parado',
  completed: 'Concluído',
}

export default function P2BPanel() {
  const [carregandoGoogle, setCarregandoGoogle] = useState(true)
  const [googleConectado, setGoogleConectado] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [erro, setErro] = useState('')

  const [planilhas, setPlanilhas] = useState(null)
  const [planilhaId, setPlanilhaId] = useState('')
  const [abas, setAbas] = useState(null)
  const [abaNome, setAbaNome] = useState('')

  const [estado, setEstado] = useState(null)
  const [extensaoLigada, setExtensaoLigada] = useState(null)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false)
  const intervaloRef = useRef(null)

  useEffect(() => () => clearInterval(intervaloRef.current), [])

  // Depois de voltar do login do Google (?google=conectado na URL), limpa
  // esse pedaço da URL e recarrega o status.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('google')) {
      params.delete('google')
      const resto = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (resto ? `?${resto}` : ''))
    }
    chamar('/api/auth/google/status')
      .then((r) => {
        setGoogleConectado(r.connected)
        setGoogleEmail(r.email || '')
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregandoGoogle(false))
  }, [])

  // Já conectado: carrega a lista de planilhas e o estado atual da
  // automação (pode já estar rodando de uma sessão anterior).
  useEffect(() => {
    if (!googleConectado) return
    chamar('/api/sheets/spreadsheets').then(setPlanilhas).catch((err) => setErro(err.message))
    chamar('/api/automation/extension-status').then((r) => setExtensaoLigada(r.connected)).catch(() => {})
    carregarEstado()
    intervaloRef.current = setInterval(carregarEstado, 4000)
    return () => clearInterval(intervaloRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleConectado])

  useEffect(() => {
    if (!planilhaId) return setAbas(null)
    chamar(`/api/sheets/spreadsheets/${planilhaId}/tabs`).then(setAbas).catch((err) => setErro(err.message))
  }, [planilhaId])

  async function carregarEstado() {
    try {
      const s = await chamar('/api/automation/state')
      setEstado(s)
      if (s.spreadsheetId) setPlanilhaId((atual) => atual || s.spreadsheetId)
      if (s.sheetName) setAbaNome((atual) => atual || s.sheetName)
    } catch {
      // silencioso — o polling tenta de novo sozinho
    }
  }

  async function conectarGoogle() {
    setErro('')
    try {
      const returnTo = encodeURIComponent(window.location.href.split('?')[0])
      const { url } = await chamar(`/api/auth/google/url?returnTo=${returnTo}`)
      window.location.href = url
    } catch (err) {
      setErro(err.message)
    }
  }

  async function iniciar() {
    if (!planilhaId || !abaNome) return setErro('Escolhe a planilha e a aba primeiro.')
    setErro('')
    setAcaoEmAndamento(true)
    try {
      await chamar('/api/sheets/connect', {
        method: 'POST',
        body: JSON.stringify({ spreadsheetId: planilhaId, sheetName: abaNome }),
      })
      await chamar('/api/automation/command', { method: 'POST', body: JSON.stringify({ action: 'start' }) })
      await carregarEstado()
    } catch (err) {
      setErro(err.message)
    } finally {
      setAcaoEmAndamento(false)
    }
  }

  async function comando(action) {
    setAcaoEmAndamento(true)
    setErro('')
    try {
      await chamar('/api/automation/command', { method: 'POST', body: JSON.stringify({ action }) })
      await carregarEstado()
    } catch (err) {
      setErro(err.message)
    } finally {
      setAcaoEmAndamento(false)
    }
  }

  if (carregandoGoogle) return <p className="mt-4 text-sm text-muted">Carregando…</p>

  if (!googleConectado) {
    return (
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-xs text-muted">Conecta a conta Google que tem acesso à planilha do CUST CODE.</p>
        <button type="button" className="btn-primary self-start" onClick={conectarGoogle}>
          Conectar Google
        </button>
        {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
      </div>
    )
  }

  const rodando = estado?.status === 'running'

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <p className="text-xs text-muted">Conectado como {googleEmail}.</p>

      {extensaoLigada === false && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          A extensão do P2B não está pareada nesse navegador ainda — precisa dela aberta pra automação rodar de
          verdade, mesmo escolhendo a planilha aqui.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Planilha
          <select
            className="field-input"
            value={planilhaId}
            onChange={(e) => { setPlanilhaId(e.target.value); setAbaNome('') }}
            disabled={rodando}
          >
            <option value="">Escolhe…</option>
            {(planilhas || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Aba
          <select
            className="field-input"
            value={abaNome}
            onChange={(e) => setAbaNome(e.target.value)}
            disabled={!planilhaId || rodando}
          >
            <option value="">Escolhe…</option>
            {(abas || []).map((a) => (
              <option key={a.sheetId} value={a.title}>{a.title}</option>
            ))}
          </select>
        </label>
      </div>

      {estado && estado.total > 0 && (
        <div className="rounded-lg bg-paper p-3 text-xs text-muted">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-ink">{STATUS_TEXTO[estado.status] || estado.status}</span>
            <span>{estado.progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full bg-brand-500" style={{ width: `${estado.progress}%` }} />
          </div>
          <div className="mt-2">
            {estado.processed} concluídos · {estado.pending} pendentes · {estado.errors} com erro de {estado.total} total
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!rodando && (
          <button type="button" className="btn-primary" onClick={iniciar} disabled={acaoEmAndamento || !planilhaId || !abaNome}>
            {acaoEmAndamento ? 'Iniciando…' : 'Iniciar'}
          </button>
        )}
        {rodando && (
          <button type="button" className="btn-ghost" onClick={() => comando('pause')} disabled={acaoEmAndamento}>
            Pausar
          </button>
        )}
        {(rodando || estado?.status === 'paused') && (
          <button type="button" className="btn-ghost" onClick={() => comando('stop')} disabled={acaoEmAndamento}>
            Parar
          </button>
        )}
      </div>

      {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
    </div>
  )
}
