import { Link } from 'react-router-dom'
import { Home, ChevronRight, User, Menu } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

const ROLE_LABEL = {
  supervisor: 'Supervisor',
  lider: 'Líder de equipe',
  bko: 'BKO',
  operacao: 'Operação',
  cadastro: 'Cadastro',
}

// Barra azul-marinho do topo, igual ao cabeçalho das telas da TIM:
// casinha > nome da página na esquerda, usuário na direita.
// onAbrirMenu: botão de menu que só aparece no celular (10/11/2026).
export default function Topbar({ titulo, inicio = '/', onAbrirMenu }) {
  const { profile } = useAuth()

  return (
    <header className="topbar">
      <nav className="flex min-w-0 items-center gap-2 text-sm">
        {onAbrirMenu && (
          <button
            type="button"
            onClick={onAbrirMenu}
            aria-label="Abrir menu"
            className="-ml-1 rounded-md p-1 text-white hover:bg-sidebar-hover md:hidden"
          >
            <Menu size={20} />
          </button>
        )}
        <Link to={inicio} className="text-white hover:text-brand-200" aria-label="Início">
          <Home size={18} />
        </Link>
        {titulo && (
          <>
            <ChevronRight size={15} className="shrink-0 text-sidebar-textMuted" />
            <span className="truncate font-medium text-white">{titulo}</span>
          </>
        )}
      </nav>

      <div className="flex min-w-0 shrink-0 items-center gap-2.5 border-l border-sidebar-border pl-4">
        <User size={18} className="text-sidebar-text" />
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-medium text-white">{profile?.name || ''}</div>
          <div className="text-[11px] text-sidebar-textMuted">
            {[ROLE_LABEL[profile?.role] || profile?.role, profile?.teams?.name].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </header>
  )
}
