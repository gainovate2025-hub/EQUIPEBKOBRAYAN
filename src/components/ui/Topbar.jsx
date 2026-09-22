import { useAuth } from '../../lib/AuthContext'
import { getInitials } from '../../lib/initials'

const ROLE_LABEL = { supervisor: 'Supervisor', lider: 'Líder de equipe', bko: 'BKO' }

export default function Topbar({ title }) {
  const { profile } = useAuth()

  return (
    <header className="topbar">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <div className="flex items-center gap-3">
        {profile?.teams?.name && (
          <span className="text-xs text-muted">{profile.teams.name}</span>
        )}
        <span className="inline-flex items-center rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-muted">
          {ROLE_LABEL[profile?.role] || profile?.role}
        </span>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700"
          title={profile?.name}
        >
          {getInitials(profile?.name)}
        </div>
      </div>
    </header>
  )
}
