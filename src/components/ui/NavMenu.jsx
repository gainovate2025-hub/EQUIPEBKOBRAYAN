import { NavLink } from 'react-router-dom'

export default function NavMenu({ items }) {
  return (
    <nav className="pill-tabs mt-8 w-fit flex-wrap" style={{ animation: 'bkoRise .5s .08s ease both' }}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `pill-tab${isActive ? ' active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
