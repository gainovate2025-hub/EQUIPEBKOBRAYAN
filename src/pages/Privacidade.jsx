export default function Privacidade() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 text-ink">
      <h1 className="text-2xl font-semibold tracking-tight">Política de privacidade — Extensões Painel BKO</h1>
      <p className="text-sm text-muted">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

      <p className="text-sm leading-relaxed">
        Esta política cobre as extensões de navegador do Painel BKO: <strong>Crivo TIM</strong> e{' '}
        <strong>Portal Parcelamento — Envio de Faturas</strong>. São ferramentas de uso interno da
        nossa equipe, feitas pra automatizar tarefas repetitivas em sistemas que já usamos no
        trabalho — não são distribuídas para o público em geral.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">O que cada extensão acessa</h2>
        <p className="text-sm leading-relaxed">
          <strong>Crivo TIM:</strong> lê o resultado de consultas de crédito na tela do Easy Vendas
          (portaleasyvendas.timbrasil.com.br) e grava aprovado/reprovado no banco de dados do Painel
          BKO (Supabase). Não acessa nem envia nenhum outro dado da tela.
        </p>
        <p className="text-sm leading-relaxed">
          <strong>Portal Parcelamento:</strong> lê o resultado de consultas de fatura no Portal
          Parcelamento (portalparcelamento.timbrasil.com.br), baixa o PDF da fatura encontrada, e usa
          o WhatsApp Web já logado no navegador da pessoa pra enviar esse PDF e duas mensagens de texto
          padrão pro cliente. A lista de clientes a processar vem de uma planilha do Google Sheets,
          configurada pelo supervisor no Painel BKO.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">O que NÃO fazemos</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Não vendemos, alugamos ou compartilhamos nenhum dado com terceiros.</li>
          <li>Não coletamos dados de navegação fora dos sites listados acima.</li>
          <li>Não lemos mensagens do WhatsApp — só enviamos as que a própria automação escreve.</li>
          <li>Os dados ficam só no banco interno do Painel BKO (Supabase) e na planilha do próprio time.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Dúvidas</h2>
        <p className="text-sm leading-relaxed">
          Fale com o supervisor responsável pelo Painel BKO.
        </p>
      </section>
    </div>
  )
}
