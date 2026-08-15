export default function Field({ label, children }) {
  return (
    <div className="flex flex-col">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}
