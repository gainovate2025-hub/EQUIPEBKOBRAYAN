export default function SectionHeading({ title, hint, right }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-6">
      <span className="text-xl font-semibold tracking-tight">{title}</span>
      {right || (hint && <span className="text-[13px] text-muted">{hint}</span>)}
    </div>
  )
}
