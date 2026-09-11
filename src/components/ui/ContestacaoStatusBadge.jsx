const LABEL = { pendente: 'Pendente', autorizada: 'Autorizada', recusada: 'Recusada' }

export default function ContestacaoStatusBadge({ status }) {
  return <span className={`badge-${status}`}>{LABEL[status] || status}</span>
}
