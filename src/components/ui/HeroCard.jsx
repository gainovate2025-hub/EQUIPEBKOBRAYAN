import ProgressBar from './ProgressBar'

export function HeroCardRed({ label, value, sub, pct, minWidth = 214 }) {
  return (
    <div className="hero-card flex flex-col gap-2.5 px-5 py-4.5" style={{ minWidth, padding: '18px 22px' }}>
      <span className="text-[11px] font-semibold uppercase tracking-widest opacity-85">{label}</span>
      <span className="text-[42px] font-bold leading-none" style={{ minHeight: 44 }}>{value}</span>
      {sub && <span className="text-xs opacity-80">{sub}</span>}
      <span className="mt-0.5 block h-1 origin-left rounded-full bg-white/55" style={{ animation: 'bkoSweep .9s .3s cubic-bezier(.2,.8,.2,1) both' }} />
      {pct != null && <ProgressBar pct={pct} />}
    </div>
  )
}

export function HeroCardWhite({ label, value, sub, minWidth = 214 }) {
  return (
    <div className="card flex flex-col gap-2.5" style={{ minWidth, padding: '18px 22px' }}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-500">{label}</span>
      <span className="text-[42px] font-bold leading-none text-ink" style={{ minHeight: 44 }}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      <span
        className="mt-0.5 block h-1 origin-left rounded-full"
        style={{ background: 'linear-gradient(90deg,#e2242f,#f6b0b5)', animation: 'bkoSweep .9s .45s cubic-bezier(.2,.8,.2,1) both' }}
      />
    </div>
  )
}
