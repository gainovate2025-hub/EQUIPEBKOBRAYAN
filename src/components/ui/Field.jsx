// O input vai dentro do <label> (10/11/2026): clicar no rótulo foca o
// campo e o leitor de tela anuncia o nome. Antes o label ficava solto.
export default function Field({ label, children }) {
  return (
    <label className="flex flex-col">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}
