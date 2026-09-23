import { useEffect, useRef, useState } from 'react'

// Fala com o whatsapp-bot/qr-server.js (roda separado, no Render — veja
// whatsapp-bot/README ou peça pro Brayan). Sem essa URL configurada, o
// painel avisa em vez de tentar chamar um servidor que não existe.
const QR_SERVER_URL = import.meta.env.VITE_WHATSAPP_QR_URL
const APP_SECRET = import.meta.env.VITE_WHATSAPP_APP_SECRET

const CHAVE_NUMERO = 'whatsapp_bot_numero'

function soDigitos(v) {
  return v.replace(/\D/g, '')
}

async function chamar(caminho, options = {}) {
  const res = await fetch(`${QR_SERVER_URL}${caminho}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-app-secret': APP_SECRET || '', ...(options.headers || {}) },
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo.erro || `Falha (${res.status})`)
  }
  return res.json()
}

export default function WhatsAppBotPanel() {
  const [numero, setNumero] = useState('')
  const [numeroAtivo, setNumeroAtivo] = useState('')
  const [status, setStatus] = useState('sem_sessao')
  const [qr, setQr] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const intervaloRef = useRef(null)

  useEffect(() => () => clearInterval(intervaloRef.current), [])

  // Se já tinha um número ligado antes (localStorage sobrevive a recarregar
  // a página), confere no servidor se ele continua conectado em vez de
  // voltar pra tela de digitar do zero.
  useEffect(() => {
    const salvo = localStorage.getItem(CHAVE_NUMERO)
    if (!salvo || !QR_SERVER_URL) return
    chamar(`/status?numero=${salvo}`)
      .then((resp) => {
        if (resp.status === 'sem_sessao' || resp.status === 'desconectado') {
          localStorage.removeItem(CHAVE_NUMERO)
          return
        }
        setNumeroAtivo(salvo)
        setStatus(resp.status)
        setQr(resp.qr || null)
        if (resp.status !== 'conectado') comecarChecagem(salvo)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pararChecagem() {
    clearInterval(intervaloRef.current)
    intervaloRef.current = null
  }

  function comecarChecagem(numeroLigado) {
    pararChecagem()
    intervaloRef.current = setInterval(async () => {
      try {
        const resp = await chamar(`/status?numero=${numeroLigado}`)
        setStatus(resp.status)
        setQr(resp.qr || null)
        if (resp.status === 'conectado' || resp.status === 'desconectado') pararChecagem()
      } catch (err) {
        setErro(err.message)
        pararChecagem()
      }
    }, 2500)
  }

  async function ligar(e) {
    e.preventDefault()
    setErro('')
    const limpo = soDigitos(numero)
    if (limpo.length < 10) return setErro('Digita o número com DDI + DDD (ex: 55 11 999998888).')

    setCarregando(true)
    try {
      const resp = await chamar('/iniciar', { method: 'POST', body: JSON.stringify({ numero: limpo }) })
      localStorage.setItem(CHAVE_NUMERO, limpo)
      setNumeroAtivo(limpo)
      setStatus(resp.status)
      comecarChecagem(limpo)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  async function desligar() {
    pararChecagem()
    setCarregando(true)
    try {
      await chamar('/desligar', { method: 'POST', body: JSON.stringify({ numero: numeroAtivo }) })
    } catch (err) {
      setErro(err.message)
    } finally {
      localStorage.removeItem(CHAVE_NUMERO)
      setStatus('sem_sessao')
      setQr(null)
      setNumeroAtivo('')
      setCarregando(false)
    }
  }

  if (!QR_SERVER_URL) {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        Essa tela ainda não foi ligada a um servidor — falta configurar <code>VITE_WHATSAPP_QR_URL</code> (o endereço do
        whatsapp-bot/qr-server.js publicado, ex: no Render).
      </p>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      {status === 'sem_sessao' && (
        <form onSubmit={ligar} className="flex items-center gap-2">
          <input
            className="field-input flex-1"
            placeholder="Número com DDI (ex: 5511999998888)"
            value={numero}
            onChange={(e) => setNumero(soDigitos(e.target.value))}
          />
          <button type="submit" className="btn-primary" disabled={carregando}>
            {carregando ? 'Ligando…' : 'Ligar'}
          </button>
        </form>
      )}

      {(status === 'conectando' || status === 'aguardando_qr') && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-muted">
            {status === 'conectando' ? 'Preparando conexão…' : 'No celular: WhatsApp > Aparelhos conectados > Conectar um aparelho.'}
          </p>
          {qr && <img src={qr} alt="QR code do WhatsApp" className="h-56 w-56 rounded-lg border border-line" />}
          <button type="button" className="text-xs text-muted underline" onClick={desligar}>Cancelar</button>
        </div>
      )}

      {status === 'conectado' && (
        <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
          <span className="text-sm font-medium text-green-700">✅ Conectado ao número {numeroAtivo}</span>
          <button type="button" className="btn-ghost" onClick={desligar} disabled={carregando}>
            {carregando ? 'Desligando…' : 'Desligar'}
          </button>
        </div>
      )}

      {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
    </div>
  )
}
