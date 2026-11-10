import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Campo } from '../../components/vendaCnpj/Campo'
import { formatarCnpj, formatarCpf } from '../../lib/documentos'

// Fila de vendas já feitas pela operação (desde 23/10/2026), esperando
// alguém do cadastro registrar no sistema de verdade. Some da lista assim
// que marcada como "Cadastrado".

// Aviso em vermelho quando o telefone do cliente (consultado no
// consultaoperadora.com.br na hora da venda) ou alguma linha já é TIM
// (pedido do Brayan em 10/11/2026). É só aviso: quem cadastra decide.
function AvisoTim({ venda }) {
  const telefoneTim = venda.operadora_linha === 'TIM'
  const linhasTim = (venda.linhas || [])
    .map((l, i) => (l.operadora === 'TIM' ? i + 1 : null))
    .filter(Boolean)
  if (!telefoneTim && linhasTim.length === 0) return null
  return (
    <div className="tim-alert mb-2 font-semibold" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        {telefoneTim && <p>Atenção: o telefone do cliente ({venda.telefone_cliente}) já é TIM.</p>}
        {linhasTim.length > 0 && <p>Atenção: {linhasTim.length > 1 ? `as linhas ${linhasTim.join(', ')} são` : `a linha ${linhasTim[0]} é`} número TIM.</p>}
      </div>
    </div>
  )
}

export default function VendasParaCadastro() {
  const [vendas, setVendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState(null) // id da venda sendo marcada agora
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('vendas_cnpj')
      .select('*, profiles(name)')
      .eq('status', 'venda_feita')
      .eq('cadastrado', false)
      .order('created_at', { ascending: true })
    setVendas(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const canal = supabase
      .channel('vendas_cnpj_cadastro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas_cnpj' }, () => load())
      .subscribe()
    const intervalo = setInterval(load, 5000)
    return () => { supabase.removeChannel(canal); clearInterval(intervalo) }
  }, [load])

  // Confere o erro do update (10/11/2026): antes, se falhasse, a venda
  // só continuava na lista sem ninguém saber por quê.
  async function marcarCadastrado(venda) {
    setMarcando(venda.id)
    setErro('')
    const { error } = await supabase
      .from('vendas_cnpj')
      .update({ cadastrado: true, cadastrado_em: new Date().toISOString() })
      .eq('id', venda.id)
    setMarcando(null)
    if (error) {
      setErro(`Não foi possível marcar "${venda.razao_social || venda.cnpj}" como cadastrado: ${error.message}`)
      return
    }
    load()
  }

  if (loading) return <p className="text-sm text-muted">Carregando…</p>
  if (vendas.length === 0) return <p className="text-sm text-muted">Nenhuma venda esperando cadastro no momento.</p>

  return (
    <div className="flex flex-col gap-4">
      {erro && <p className="tim-alert" role="alert">{erro}</p>}
      {vendas.map((v) => (
        <div key={v.id} className="card flex flex-col gap-1 p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <p className="text-base font-bold text-ink">{v.razao_social || '(sem razão social)'}</p>
            <span className="text-xs text-muted">
              {v.profiles?.name || 'Alguém'} · {new Date(v.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
          <AvisoTim venda={v} />
          <Campo comCopiar label="CNPJ" valor={v.cnpj} />
          <Campo comCopiar label="Razão social" valor={v.razao_social} />
          <Campo comCopiar label="Nome fantasia" valor={v.nome_fantasia} />
          <Campo comCopiar label="Situação" valor={v.situacao} />
          <Campo comCopiar label="Aberta desde" valor={v.data_abertura} />
          <Campo comCopiar label="Atividade" valor={v.atividade_principal} />
          <Campo comCopiar label="Endereço" valor={v.endereco} />
          <Campo comCopiar label="Telefone (empresa)" valor={v.telefone} />
          <Campo comCopiar label="E-mail (empresa)" valor={v.email} />
          <Campo comCopiar label="Ponto de referência" valor={v.ponto_referencia} />
          <Campo comCopiar label="Nome do cliente" valor={v.nome_cliente} />
          <Campo comCopiar label="CPF do cliente" valor={v.cpf_cliente ? formatarCpf(v.cpf_cliente) : ''} />
          <Campo comCopiar label="Telefone do cliente (3C)" valor={v.telefone_cliente} />
          <Campo label="Operadora do telefone do cliente" valor={v.operadora_linha} />
          <Campo comCopiar label="E-mail do cliente" valor={v.email_cliente} />
          <Campo comCopiar label="Plano" valor={v.plano} />
          <Campo comCopiar label="Captador da venda" valor={v.captador} />
          <Campo comCopiar label="Quem fechou a venda" valor={v.fechou_venda} />

          {(v.linhas || []).map((l, i) => (
            <div key={i} className="mt-2 border-t border-divider pt-2">
              <p className="mb-1 text-xs font-semibold text-ink">Linha {i + 1}</p>
              <Campo comCopiar label="Tipo" valor={l.tipo === 'portabilidade' ? 'Portabilidade' : 'Linha nova'} />
              <Campo comCopiar label="Número" valor={l.numero} />
              <Campo comCopiar label="Operadora" valor={l.operadora || l.operadora_bruta} />
              <Campo comCopiar label="Tipo de chip" valor={l.tipo_chip === 'esim' ? 'eSIM' : 'Chip físico'} />
              <Campo comCopiar label="Titular" valor={l.titular_tipo === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'} />
              <Campo
                comCopiar
                label={l.titular_tipo === 'pj' ? 'CNPJ do titular' : 'CPF do titular'}
                valor={l.titular_tipo === 'pj' ? formatarCnpj(l.titular_documento) : formatarCpf(l.titular_documento)}
              />
              <Campo
                comCopiar
                label={l.titular_tipo === 'pj' ? 'Razão social do titular' : 'Nome do titular'}
                valor={l.titular_nome}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-primary mt-3 self-start"
            onClick={() => marcarCadastrado(v)}
            disabled={marcando === v.id}
          >
            {marcando === v.id ? 'Marcando…' : 'Marcar como cadastrado'}
          </button>
        </div>
      ))}
    </div>
  )
}
