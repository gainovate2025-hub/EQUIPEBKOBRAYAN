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
  { key: 'modulos', label: 'Responsável por', width: '1.8fr' },
  { key: 'active', label: 'Status', width: '1fr' },
  { key: 'actions', label: '', width: '.8fr', align: 'right' },
]

// Só organiza a visão do supervisor — não muda o que o BKO vê/acessa.
const MODULOS = [
  { key: 'fatura', label: 'Fatura' },
  { key: 'contestacao', label: 'Contestação' },
  { key: 'reagendamento', label: 'Reagendamento' },
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

  async function toggleModulo(bko, moduloKey) {
    const atuais = bko.modulos_responsavel || []
    const novos = atuais.includes(moduloKey)
      ? atuais.filter((m) => m !== moduloKey)
      : [...atuais, moduloKey]
    try {
      await updateProfile(bko.id, { modulos_responsavel: novos })
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar.', 'error')
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
            if (key === 'modulos') {
              const atuais = row.bko.modulos_responsavel || []
              return (
                <div className="flex flex-wrap gap-1">
                  {MODULOS.map((m) => {
                    const ligado = atuais.includes(m.key)
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => toggleModulo(row.bko, m.key)}
                        className={
                          ligado
                            ? 'rounded-full border border-transparent bg-brand-500 px-2 py-0.5 text-[11px] font-medium text-white'
                            : 'rounded-full border border-line bg-transparent px-2 py-0.5 text-[11px] font-medium text-muted'
                        }
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              )
            }
            if (key === 'active') return (
              <button
                type="button"
                onClick={() => toggleActive(row.bko)}
                className="text-xs font-semibold"
                style={{ color: row.active ? '#067647' : '#b42318' }}
              >
                {row.active ? '● Ativo' : '● Inativo'}
              </button>
            )
            if (key === 'actions') return (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(row.bko)}>Editar</button>
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
