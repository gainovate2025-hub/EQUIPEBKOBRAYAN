export default function ProgressBar({ pct, delay = 0 }) {
  const width = Math.max(0, Math.min(pct, 100))
  return (
    <span className="progress-track">
      <span
        className="progress-fill"
        style={{ width: `${width}%`, animationDelay: `${delay}s` }}
      />
    </span>
  )
}
