import Logo from './Logo'
import { useAuth } from '../../lib/AuthContext'

export default function PageHeader({ title, subtitle, right }) {
  const { signOut } = useAuth()

  return (
    <div className="flex flex-wrap items-start justify-between gap-8" style={{ animation: 'bkoRise .5s ease both' }}>
      <div className="flex items-center gap-4">
        <Logo />
        <div className="flex flex-col gap-1">
          <span className="text-[27px] font-semibold tracking-tight">{title}</span>
          <span className="text-[13px] text-muted">{subtitle}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {right}
        <button type="button" className="btn-ghost" onClick={signOut}>Sair</button>
      </div>
    </div>
  )
}
