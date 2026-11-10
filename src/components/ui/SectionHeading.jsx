// Faixa azul-marinho com título, no padrão das seções das telas da TIM.
export default function SectionHeading({ title, hint, right }) {
  return (
    <div className="section-bar">
      <span className="text-base font-semibold text-white">{title}</span>
      {right || (hint && <span className="text-[13px] text-sidebar-text">{hint}</span>)}
    </div>
  )
}
