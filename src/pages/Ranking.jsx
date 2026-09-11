import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import SectionHeading from '../components/ui/SectionHeading'
import Toast from '../components/ui/Toast'
import { useToast } from '../lib/useToast'
import { fetchTeamRanking } from '../lib/api'
import { fmtMoney } from '../lib/helpers'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const { profile, contestacaoLabel } = useAuth()
  const { toast, showToast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTeamRanking()
      .then((data) => { if (!cancelled) setRows(data) })
      .catch((err) => showToast(err.message || 'Falha ao carregar ranking.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const teamName = profile?.teams?.name || 'sua equipe'

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Ranking de comissão" hint={`${teamName} — quem fez mais dinheiro`} />

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-muted">Ninguém na equipe ainda.</p>}

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const perf = r.performance || {}
          const isMe = r.id === profile?.id
          return (
            <div
              key={r.id}
              className="card flex items-center gap-4 p-5"
              style={isMe ? { borderColor: '#f6b0b5' } : undefined}
            >
              <span className="w-9 text-center text-xl">{MEDALS[i] || `#${i + 1}`}</span>
              <div className="flex-1">
                <span className="font-semibold">{r.name}{isMe ? ' (você)' : ''}</span>
                <div className="text-xs text-muted">
                  {perf.contestations_done ?? 0} {contestacaoLabel.toLowerCase()} · {perf.rescheduling_done ?? 0} reagendamentos
                </div>
              </div>
              <span className="text-lg font-bold text-brand-700">{fmtMoney(perf.commission)}</span>
            </div>
          )
        })}
      </div>

      <Toast toast={toast} />
    </div>
  )
}
