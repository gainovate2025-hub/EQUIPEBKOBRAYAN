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
  // Modo novo (28/09/2026): em vez de buscar por CUSTCODE e trazer a
  // fatura, busca por CNPJ e só grava o CUSTCODE encontrado de volta na
  // planilha. Mesma extensão, mesma conta — só muda o que é lido/escrito.
  const [modo, setModo] = useState('custcode')
  const [colunaCnpj, setColunaCnpj] = useState('CNPJ')
  const [colunaCustcodeSaida, setColunaCustcodeSaida] = useState('CUSTCODE')

  const [estado, setEstado] = useState(null)
  const [extensaoLigada, setExtensaoLigada] = useState(null)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false)
  const [codigoPareamento, setCodigoPareamento] = useState(null)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const [gerandoCodigo, setGerandoCodigo] = useState(false)
  const intervaloRef = useRef(null)
  const cronometroRef = useRef(null)

  useEffect(() => () => clearInterval(intervaloRef.current), [])
  useEffect(() => () => clearInterval(cronometroRef.current), [])

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

  // Gera o código de 6 dígitos pra colar na extensão "Conector P2B" (o
  // mesmo código de pareamento que o painel próprio do P2B mostra) — assim
  // não precisa sair do site do BKO pra parear.
  async function gerarCodigoPareamento() {
    setErro('')
    setGerandoCodigo(true)
    try {
      const { code, expiresAt } = await chamar('/api/settings/pairing-code', { method: 'POST' })
      setCodigoPareamento(code)
      clearInterval(cronometroRef.current)
      const tick = () => {
        const restante = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
        setSegundosRestantes(restante)
        if (restante <= 0) {
          clearInterval(cronometroRef.current)
          setCodigoPareamento(null)
        }
      }
      tick()
      cronometroRef.current = setInterval(tick, 1000)
    } catch (err) {
      setErro(err.message)
    } finally {
      setGerandoCodigo(false)
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
      // Busca o mapeamento de colunas já salvo e só troca os campos do modo
      // escolhido — nunca manda o objeto parcial (isso apagaria as colunas
      // do outro modo, porque o backend substitui o mapeamento inteiro).
      const mapeamentoAtual = await chamar('/api/sheets/mapping')
      const columnMapping =
        modo === 'cnpj'
          ? { ...mapeamentoAtual, cnpj: colunaCnpj, custcodeOutput: colunaCustcodeSaida }
          : mapeamentoAtual
      await chamar('/api/sheets/connect', {
        method: 'POST',
        body: JSON.stringify({ spreadsheetId: planilhaId, sheetName: abaNome, columnMapping, mode: modo }),
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <p>
            A extensão do P2B não está pareada nesse navegador ainda — precisa dela aberta pra automação rodar de
            verdade, mesmo escolhendo a planilha aqui.
          </p>
          <div className="mt-2">
            {codigoPareamento ? (
              <div className="flex items-center gap-3">
                <span className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-xl font-bold tracking-[0.3em] text-amber-800">
                  {codigoPareamento}
                </span>
                <span className="text-[11px] text-amber-600">Expira em {segundosRestantes}s</span>
              </div>
            ) : (
              <button type="button" className="btn-ghost btn-sm" onClick={gerarCodigoPareamento} disabled={gerandoCodigo}>
                {gerandoCodigo ? 'Gerando…' : 'Gerar código de conexão'}
              </button>
            )}
            <p className="mt-2 text-[11px] text-amber-600">
              Clica no ícone da extensão "Conector P2B" (peça de quebra-cabeça, na barra do Chrome), cola esse
              código e clica em Conectar.
            </p>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        O que a automação vai fazer
        <select className="field-input" value={modo} onChange={(e) => setModo(e.target.value)} disabled={rodando}>
          <option value="custcode">Buscar por CUSTCODE → trazer a fatura</option>
          <option value="cnpj">Buscar por CNPJ → só descobrir o CUSTCODE</option>
        </select>
      </label>

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

      {modo === 'cnpj' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Coluna do CNPJ (entrada)
            <input className="field-input" value={colunaCnpj} onChange={(e) => setColunaCnpj(e.target.value)} disabled={rodando} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Coluna do CUSTCODE (saída)
            <input
              className="field-input"
              value={colunaCustcodeSaida}
              onChange={(e) => setColunaCustcodeSaida(e.target.value)}
              disabled={rodando}
            />
          </label>
        </div>
      )}

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
