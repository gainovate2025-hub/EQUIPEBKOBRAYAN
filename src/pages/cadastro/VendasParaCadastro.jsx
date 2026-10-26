import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Campo } from '../../components/vendaCnpj/Campo'
import { formatarCnpj, formatarCpf } from '../../lib/documentos'

// RASCUNHO (23/10/2026) — fila de vendas já feitas pela operação,
// esperando alguém do cadastro registrar no sistema de verdade. Some da
// lista assim que marcada como "Cadastrado".

export default function VendasParaCadastro() {
  const [vendas, setVendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState(null) // id da venda sendo marcada agora

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

  async function marcarCadastrado(venda) {
    setMarcando(venda.id)
    await supabase
      .from('vendas_cnpj')
      .update({ cadastrado: true, cadastrado_em: new Date().toISOString() })
      .eq('id', venda.id)
    setMarcando(null)
    load()
  }

  if (loading) return <p className="text-sm text-muted">Carregando…</p>
  if (vendas.length === 0) return <p className="text-sm text-muted">Nenhuma venda esperando cadastro no momento.</p>

  return (
    <div className="flex flex-col gap-4">
      {vendas.map((v) => (
        <div key={v.id} className="card flex flex-col gap-1 p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-base font-bold text-ink">{v.razao_social || '(sem razão social)'}</p>
            <span className="text-[11px] text-muted">
              {v.profiles?.name || 'Alguém'} — {new Date(v.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
          <Campo comCopiar label="CNPJ" valor={v.cnpj} />
          <Campo comCopiar label="Razão Social" valor={v.razao_social} />
          <Campo comCopiar label="Nome Fantasia" valor={v.nome_fantasia} />
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
          <Campo comCopiar label="E-mail do cliente" valor={v.email_cliente} />
          <Campo comCopiar label="Plano" valor={v.plano} />
          <Campo comCopiar label="Captador da venda" valor={v.captador} />
          <Campo comCopiar label="Quem fechou a venda" valor={v.fechou_venda} />

          {(v.linhas || []).map((l, i) => (
            <div key={i} className="mt-2 border-t border-line pt-2">
              <p className="mb-1 text-xs font-semibold text-ink">Linha {i + 1}</p>
              <Campo comCopiar label="Tipo" valor={l.tipo === 'portabilidade' ? 'Portabilidade' : 'Linha nova'} />
              <Campo comCopiar label="Número" valor={l.numero} />
              <Campo comCopiar label="Operadora" valor={l.operadora || l.operadora_bruta} />
              <Campo comCopiar label="Tipo de chip" valor={l.tipo_chip === 'esim' ? 'eSIM' : 'Chip físico'} />
              <Campo comCopiar label="Titular" valor={l.titular_tipo === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'} />
              <Campo
                comCopiar
                label={l.titular_tipo === 'pj' ? 'CNPJ do titular' : 'CPF do titular'}
                valor={l.titular_tipo === 'pj' ? formatarCnpj(l.titular_documento) : formatarCpf(l.titular_documento)}
              />
              <Campo
                comCopiar
                label={l.titular_tipo === 'pj' ? 'Razão Social do titular' : 'Nome do titular'}
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
