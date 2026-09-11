import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../../lib/AuthContext'

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

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="mb-2 truncate text-xs text-sidebar-textMuted">{profile?.name}</div>
        <button type="button" onClick={signOut} className="sidebar-link w-full justify-start">
          Sair
        </button>
      </div>
    </aside>
  )
}
