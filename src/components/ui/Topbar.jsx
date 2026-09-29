import { Search, Clock } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

const ROLE_LABEL = { supervisor: 'Supervisor', lider: 'Líder de equipe', bko: 'BKO' }

function iniciais(nome) {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/)
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase()
}

export default function Topbar() {
  const { profile } = useAuth()
  const agora = new Date()

  return (
    <header className="topbar">
      <div className="relative w-full max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          placeholder="Buscar por nome, CNPJ, CustCode…"
          className="field-input pl-9"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <Clock size={14} />
          <span>Última atualização</span>
          <span className="font-medium text-ink">
            {agora.toLocaleDateString('pt-BR')} {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {iniciais(profile?.name)}
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-ink">{profile?.teams?.name || profile?.name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[profile?.role] || profile?.role}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
