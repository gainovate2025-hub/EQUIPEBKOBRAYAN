import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import Secao from '../../components/ui/Secao'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchCustcodesFatura, enviarCustcodeFatura } from '../../lib/api'

const DIA_MS = 86400000

function diasDesde(data) {
  return Math.floor((Date.now() - new Date(data).getTime()) / DIA_MS)
}

function Badge({ status }) {
  if (status === 'saiu') return <span className="badge-ok">Saiu</span>
  if (status === 'refazer') return <span className="badge-bad">Precisa refazer</span>
  return <span className="badge-neutral">Pendente</span>
}

export default function BkoCustCode() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [custcode, setCustcode] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviados, setEnviados] = useState([])
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    if (!profile?.id) return
    setCarregando(true)
    try {
      setEnviados(await fetchCustcodesFatura({ bkoId: profile.id }))
    } catch (err) {
      showToast(err.message || 'Falha ao carregar.', 'error')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [profile?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!custcode.trim()) return showToast('Informe o CustCode.', 'error')
    setEnviando(true)
    try {
      await enviarCustcodeFatura(custcode.trim())
      setCustcode('')
      showToast('CustCode enviado.')
      carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const precisamRefazer = enviados.filter((c) => c.status === 'refazer')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Envie o CustCode da fatura em contestação. Depois de alguns dias o supervisor confirma se saiu.</p>

      <Secao titulo="Enviar CustCode">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <Field label="CustCode">
            <input className="field-input" value={custcode} onChange={(e) => setCustcode(e.target.value)} placeholder="Ex: CC-10293" />
          </Field>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar CustCode'}
          </button>
        </form>
      </Secao>

      {precisamRefazer.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg2 border border-bad-border bg-bad-bg p-4">
          <p className="text-sm font-medium text-bad-text">
            {precisamRefazer.length === 1
              ? '1 CustCode não saiu. Refaça e envie de novo.'
              : `${precisamRefazer.length} CustCodes não saíram. Refaça e envie de novo.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {precisamRefazer.map((c) => (
              <span key={c.id} className="rounded bg-surface px-2 py-1 font-mono text-xs text-bad-text">{c.custcode}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted">Enviados por você ({enviados.length})</p>
        {carregando ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : enviados.length === 0 ? (
          <p className="text-sm text-muted">Nenhum CustCode enviado ainda.</p>
        ) : (
          enviados.map((c) => (
            <div key={c.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-ink">{c.custcode}</span>
                <Badge status={c.status} />
              </div>
              <span className="text-xs text-muted">
                {diasDesde(c.enviado_em)} dia{diasDesde(c.enviado_em) === 1 ? '' : 's'} atrás
              </span>
            </div>
          ))
        )}
      </div>
      <Toast toast={toast} />
    </div>
  )
}
