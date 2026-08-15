import { useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import EditBkoModal from '../../components/EditBkoModal'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { updateProfile } from '../../lib/api'

const COLUMNS = [
  { key: 'name', label: 'Nome', width: '1.6fr' },
  { key: 'username', label: 'Usuário', width: '1.2fr' },
  { key: 'active', label: 'Status', width: '1fr' },
  { key: 'actions', label: '', width: '.8fr', align: 'right' },
]

export default function Equipe() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [editing, setEditing] = useState(null)

  async function toggleActive(bko) {
    try {
      await updateProfile(bko.id, { active: !bko.active })
      showToast(`${bko.name} ${bko.active ? 'desativado' : 'ativado'}.`)
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar status.', 'error')
    }
  }

  const rows = team.map((b) => ({ key: b.id, bko: b, name: b.name, username: b.username, active: b.active }))

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Equipe — contas de BKO" hint="Nome, usuário, senha e status de cada conta" />
      {loading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          renderCell={(row, key) => {
            if (key === 'name') return <span className="font-medium">{row.name}</span>
            if (key === 'username') return <span className="text-muted">{row.username}</span>
            if (key === 'active') return (
              <button
                type="button"
                onClick={() => toggleActive(row.bko)}
                className="text-xs font-semibold"
                style={{ color: row.active ? '#0ca30c' : '#a5121c' }}
              >
                {row.active ? '● Ativo' : '● Inativo'}
              </button>
            )
            if (key === 'actions') return (
              <button type="button" className="btn-ghost" style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={() => setEditing(row.bko)}>Editar</button>
            )
            return row[key]
          }}
        />
      )}
      {editing && (
        <EditBkoModal bko={editing} onClose={() => setEditing(null)} onSaved={reload} showToast={showToast} />
      )}
      <Toast toast={toast} />
    </div>
  )
}
