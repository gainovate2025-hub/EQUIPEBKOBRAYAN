// Campo de formulário com rótulo em cima e * vermelho quando obrigatório.
// O input vai como children DENTRO do <label>, assim clicar no rótulo
// já foca o campo e o leitor de tela lê o nome certo (10/11/2026).
export function Obrigatorio() {
  return <span className="text-tim" aria-hidden> *</span>
}

export default function CampoTim({ label, obrigatorio, className = '', children }) {
  return (
    <label className={`tim-label ${className}`}>
      <span>
        {label}
        {obrigatorio && <Obrigatorio />}
      </span>
      {children}
    </label>
  )
}
