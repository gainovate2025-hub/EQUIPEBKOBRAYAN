export default function SectionHeading({ title, hint, right }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-6">
      <span className="text-base font-semibold text-ink">{title}</span>
      {right || (hint && <span className="text-[13px] text-muted">{hint}</span>)}
    </div>
  )
}
