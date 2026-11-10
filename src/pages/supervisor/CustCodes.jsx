import { useEffect, useMemo, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import Tabs from '../../components/ui/Tabs'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchCustcodesFatura, verificarCustcodeFatura } from '../../lib/api'

const DIA_MS = 86400000
const PRAZO_DIAS = 5

function diasDesde(data) {
  return Math.floor((Date.now() - new Date(data).getTime()) / DIA_MS)
}

const ABAS = [
  { key: 'verificar', label: 'Pra verificar (5+ dias)' },
  { key: 'pendente', label: 'Todos pendentes' },
  { key: 'resolvido', label: 'Já verificados' },
]

export default function CustCodes() {
  const { team } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [casos, setCasos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState('verificar')

  async function carregar() {
    setCarregando(true)
    try {
      setCasos(await fetchCustcodesFatura())
    } catch (err) {
      showToast(err.message || 'Falha ao carregar.', 'error')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const idsDoTime = useMemo(() => new Set(team.map((b) => b.id)), [team])
  const casosDoTime = useMemo(
    () => casos.filter((c) => idsDoTime.has(c.bko_id)).sort((a, b) => new Date(b.enviado_em) - new Date(a.enviado_em)),
    [casos, idsDoTime]
  )

  const listados = useMemo(() => {
    if (aba === 'resolvido') return casosDoTime.filter((c) => c.status !== 'pendente')
    if (aba === 'pendente') return casosDoTime.filter((c) => c.status === 'pendente')
    return casosDoTime.filter((c) => c.status === 'pendente' && diasDesde(c.enviado_em) >= PRAZO_DIAS)
  }, [casosDoTime, aba])

  async function marcar(id, resultado) {
    try {
      await verificarCustcodeFatura(id, resultado)
      showToast(resultado === 'saiu' ? 'Marcado como Saiu.' : 'Marcado pra refazer.')
      carregar()
    } catch (err) {
      showToast(err.message || 'Falha ao verificar.', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">CustCodes de fatura em contestação. Confira quem passou do prazo sem sair.</p>

      <Tabs tabs={ABAS} active={aba} onChange={setAba} />

      {carregando ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : listados.length === 0 ? (
        <p className="text-sm text-muted">Nada por aqui.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {listados.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-medium text-ink">{c.custcode}</span>
                <span className="text-muted">· {c.profiles?.name}</span>
                <span className="text-xs text-muted">· {diasDesde(c.enviado_em)} dia{diasDesde(c.enviado_em) === 1 ? '' : 's'} atrás</span>
                {c.status !== 'pendente' && (
                  <span className={c.status === 'saiu' ? 'badge-ok' : 'badge-bad'}>
                    {c.status === 'saiu' ? 'Saiu' : 'Precisa refazer'}
                  </span>
                )}
              </div>
              {c.status === 'pendente' && (
                <div className="flex gap-2">
                  <button type="button" className="btn-outline btn-sm" onClick={() => marcar(c.id, 'saiu')}>Saiu</button>
                  <button type="button" className="btn-outline-danger btn-sm" onClick={() => marcar(c.id, 'refazer')}>Refazer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Toast toast={toast} />
    </div>
  )
}
