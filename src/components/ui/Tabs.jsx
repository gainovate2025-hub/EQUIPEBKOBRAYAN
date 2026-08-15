export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="pill-tabs w-fit">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`pill-tab${active === t.key ? ' active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
