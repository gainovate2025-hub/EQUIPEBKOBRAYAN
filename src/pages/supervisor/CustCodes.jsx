import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'

export default function CustCodes() {
  const { contestacoes, loading } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [statusFilter, setStatusFilter] = useState('pendente')

  const codigos = useMemo(() => {
    return contestacoes
      .filter((c) => c.cust_code && (statusFilter === 'all' || c.status === statusFilter))
      .map((c) => c.cust_code)
  }, [contestacoes, statusFilter])

  function copiarTudo() {
    navigator.clipboard?.writeText(codigos.join('\n'))
    showToast(`${codigos.length} cust code${codigos.length === 1 ? '' : 's'} copiado${codigos.length === 1 ? '' : 's'}.`)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Cust Codes" hint="Só os códigos, prontos pra copiar" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="field-input" style={{ maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="pendente">Pendentes</option>
          <option value="autorizada">Autorizadas</option>
          <option value="recusada">Recusadas</option>
        </select>
        <button type="button" className="btn-primary" disabled={codigos.length === 0} onClick={copiarTudo}>
          <Copy size={14} /> Copiar tudo ({codigos.length})
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {!loading && codigos.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">Nenhum cust code com esse filtro.</div>
      )}

      {!loading && codigos.length > 0 && (
        <div className="card p-4">
          <pre className="whitespace-pre-wrap break-all font-mono text-sm">{codigos.join('\n')}</pre>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
