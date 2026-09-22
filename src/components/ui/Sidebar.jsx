import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import Logo from './Logo'
import { useAuth } from '../../lib/AuthContext'
import { getInitials } from '../../lib/initials'

export default function Sidebar({ title, items }) {
  const { profile, signOut } = useAuth()

  return (
    <aside className="sidebar">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo />
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            {item.icon && <item.icon size={16} strokeWidth={2} />}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
          {getInitials(profile?.name)}
        </div>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-text">{profile?.name}</span>
        <button
          type="button"
          onClick={signOut}
          title="Sair"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-textMuted transition-colors duration-100 hover:bg-sidebar-hover hover:text-white"
        >
          <LogOut size={15} strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}
