import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import Logo from './Logo'

// className: o AppShell esconde a sidebar no celular e reaproveita ela
// como gaveta (10/11/2026).
export default function Sidebar({ title, items, className = '' }) {
  const { signOut } = useAuth()

  return (
    <aside className={`sidebar ${className}`}>
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
        <Logo />
        <span className="h-6 w-px bg-sidebar-border" />
        <span className="truncate text-sm font-medium text-sidebar-text">{title}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
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

      <div className="border-t border-sidebar-border px-2 py-3">
        <button type="button" onClick={signOut} className="sidebar-link w-full justify-start">
          <LogOut size={16} strokeWidth={2} />
          Sair
        </button>
      </div>
    </aside>
  )
}
