// Seção no padrão da tela "Cadastro de Cliente" da TIM (10/11/2026):
// cartão branco com a faixa azul-marinho no topo, por dentro do cartão.
// Antes cada tela tinha a sua cópia (VendaCnpj) ou usava a faixa solta
// (SectionHeading) com o conteúdo fora dela.
export default function Secao({ titulo, icone: Icone, acao, className = '', children }) {
  return (
    <section className={`tim-section ${className}`}>
      <div className="tim-section-bar">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          {Icone && <Icone size={17} aria-hidden />}
          {titulo}
        </h2>
        {acao}
      </div>
      <div className="tim-section-body">{children}</div>
    </section>
  )
}
