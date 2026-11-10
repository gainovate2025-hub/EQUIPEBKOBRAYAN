import { statusOf } from '../../lib/helpers'

// Bolinha colorida pelos tokens good/warn/bad (10/11/2026).
const DOT = { good: 'bg-good-text', warn: 'bg-warn-text', bad: 'bg-bad-text' }

export default function StatusBadge({ pct, showLabel = true }) {
  const s = statusOf(pct)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {showLabel && s.label}
    </span>
  )
}
