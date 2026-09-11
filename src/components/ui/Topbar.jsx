import { useAuth } from '../../lib/AuthContext'

const ROLE_LABEL = { supervisor: 'Supervisor', lider: 'Líder de equipe', bko: 'BKO' }

export default function Topbar({ title }) {
  const { profile } = useAuth()

  return (
    <header className="topbar">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <div className="flex items-center gap-2 text-xs text-muted">
        {profile?.teams?.name && <span>{profile.teams.name} ·</span>}
        <span>{ROLE_LABEL[profile?.role] || profile?.role}</span>
      </div>
    </header>
  )
}
