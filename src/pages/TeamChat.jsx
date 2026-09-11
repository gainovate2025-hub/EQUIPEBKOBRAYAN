import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import SectionHeading from '../components/ui/SectionHeading'
import Toast from '../components/ui/Toast'
import { useToast } from '../lib/useToast'
import { fetchAllTeams, fetchTeamMessages, postTeamMessage } from '../lib/api'
import { fmtDateTime } from '../lib/helpers'

export default function TeamChat() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [teams, setTeams] = useState([])
  const [activeTeamId, setActiveTeamId] = useState(profile?.team_id || '')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchAllTeams()
      .then((data) => {
        setTeams(data)
        setActiveTeamId((current) => current || data[0]?.id || '')
      })
      .catch((err) => showToast(err.message || 'Falha ao carregar equipes.', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMessages(teamId) {
    if (!teamId) return
    try {
      const data = await fetchTeamMessages(teamId)
      setMessages(data)
    } catch (err) {
      showToast(err.message || 'Falha ao carregar mensagens.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!activeTeamId) return
    setLoading(true)
    loadMessages(activeTeamId)
    const interval = setInterval(() => loadMessages(activeTeamId), 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    try {
      await postTeamMessage(activeTeamId, text.trim())
      setText('')
      await loadMessages(activeTeamId)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSending(false)
    }
  }

  const isOwnTeam = activeTeamId === profile?.team_id

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Chat da equipe" hint="Provocações e recados — visível pra quem estiver no mesmo chat" />

      <div className="pill-tabs w-fit">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pill-tab${activeTeamId === t.id ? ' active' : ''}`}
            onClick={() => setActiveTeamId(t.id)}
          >
            {t.id === profile?.team_id ? 'Minha equipe' : `Falar com ${t.name}`}
          </button>
        ))}
      </div>

      <div className="card flex max-h-[420px] flex-col-reverse gap-3 overflow-y-auto p-5">
        {loading && <p className="text-sm text-muted">Carregando…</p>}
        {!loading && messages.length === 0 && <p className="text-sm text-muted">Nenhuma mensagem ainda — manda a primeira.</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{m.user_name || 'Alguém'}</span>
              <span className="text-[11px] text-muted">{fmtDateTime(m.created_at)}</span>
            </div>
            <p className="text-sm text-label">{m.message}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          className="field-input flex-1"
          placeholder={isOwnTeam ? 'Manda um recado pra equipe…' : 'Manda uma provocação pra outra equipe…'}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={sending || !text.trim()}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      <Toast toast={toast} />
    </div>
  )
}
