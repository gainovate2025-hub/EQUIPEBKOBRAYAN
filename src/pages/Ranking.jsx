import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import Toast from '../components/ui/Toast'
import { useToast } from '../lib/useToast'
import { fetchTeamRanking } from '../lib/api'
import { fmtMoney } from '../lib/helpers'

// Cor da posição (1º, 2º, 3º), no lugar dos emojis de medalha. Tokens
// "medal" no tailwind.config.js (10/11/2026: texto escuro no ouro/prata).
const COR_POSICAO = ['bg-medal-gold text-ink', 'bg-medal-silver text-ink', 'bg-medal-bronze text-white']

export default function Ranking() {
  const { profile, contestacaoLabel } = useAuth()
  const { toast, showToast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTeamRanking(profile?.team_id)
      .then((data) => { if (!cancelled) setRows(data) })
      .catch((err) => showToast(err.message || 'Falha ao carregar ranking.', 'error'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.team_id])

  const teamName = profile?.teams?.name || 'sua equipe'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Comissão do mês de {teamName}, da maior pra menor.</p>

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-muted">Ninguém na equipe ainda.</p>}

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const perf = r.performance || {}
          const isMe = r.id === profile?.id
          return (
            <div
              key={r.id}
              className={`card flex items-center gap-4 p-4 sm:p-5 ${isMe ? 'border-brand-400' : ''}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold ${COR_POSICAO[i] || 'bg-paper text-ink'}`}>
                {i + 1}º
              </span>
              <div className="min-w-0 flex-1">
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
