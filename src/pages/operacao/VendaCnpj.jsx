import { useState } from 'react'
import { Search, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { Campo } from '../../components/vendaCnpj/Campo'
import { soDigitos, formatarCnpj, formatarCpf } from '../../lib/documentos'

// RASCUNHO (26/10/2026) — ver supabase/migration_025_vendas_cnpj.sql e
// seguintes pro contexto completo. Campos de venda são um chute inicial —
// ajustar quando as informações reais chegarem.

function semAcento(v) {
  return (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const PLANOS = ['R$ 50', 'R$ 70', 'R$ 100']

function formatarDataBr(iso) {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// Monta o endereço num texto só, pra ficar fácil de copiar de uma vez.
function montarEndereco(estabelecimento) {
  if (!estabelecimento) return ''
  const partes = [
    [estabelecimento.tipo_logradouro, estabelecimento.logradouro].filter(Boolean).join(' '),
    estabelecimento.numero,
    estabelecimento.bairro,
    estabelecimento.cep,
    estabelecimento.cidade?.nome,
    estabelecimento.estado?.sigla,
  ].filter(Boolean)
  return partes.join(', ')
}

// Busca na API pública do cnpj.ws — mesma fonte que gera aquela tela que
// a operação usava na mão. É de graça, sem chave, mas tem limite de
// poucas consultas por minuto (uso individual, não em massa).
async function buscarCnpj(cnpjLimpo) {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjLimpo}`)
  if (res.status === 429) throw new Error('Muitas consultas seguidas — espera um minuto e tenta de novo.')
  if (!res.ok) throw new Error('CNPJ não encontrado ou serviço fora do ar.')
  return res.json()
}

// "Suspensa", "Inapta" (com ou sem acento/maiúscula) — não pode vender
// pra esse CNPJ. "Baixada"/"Nula" também são encerradas, mas o pedido foi
// especificamente por esses dois termos — mantém restrito a eles por ora.
function situacaoBloqueada(situacao) {
  const s = semAcento(situacao)
  return s.includes('suspens') || s.includes('inapt')
}

export default function VendaCnpj() {
  const { profile } = useAuth()
  const [cnpj, setCnpj] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // resposta crua do cnpj.ws

  const [mostrarFormVenda, setMostrarFormVenda] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [vendaSalva, setVendaSalva] = useState(null) // registro já gravado, pra mostrar a ficha final

  const [quantidadeLinhas, setQuantidadeLinhas] = useState('1')
  const [numerosLinhas, setNumerosLinhas] = useState('')
  const [tipoLinha, setTipoLinha] = useState('nova')
  const [plano, setPlano] = useState(PLANOS[0])

  // Titular da linha — PF pede CPF + nome, PJ pede Razão Social + CNPJ.
  const [titularTipo, setTitularTipo] = useState('pf')
  const [titularCpf, setTitularCpf] = useState('')
  const [titularNomePf, setTitularNomePf] = useState('')
  const [titularRazaoSocial, setTitularRazaoSocial] = useState('')
  const [titularCnpj, setTitularCnpj] = useState('')

  function limparTudo() {
    setCnpj('')
    setDados(null)
    setErro('')
    setMostrarFormVenda(false)
    setVendaSalva(null)
    setQuantidadeLinhas('1')
    setNumerosLinhas('')
    setTipoLinha('nova')
    setPlano(PLANOS[0])
    setTitularTipo('pf')
    setTitularCpf('')
    setTitularNomePf('')
    setTitularRazaoSocial('')
    setTitularCnpj('')
  }

  async function consultar(e) {
    e?.preventDefault()
    setErro('')
    setDados(null)
    setVendaSalva(null)
    setMostrarFormVenda(false)
    const limpo = soDigitos(cnpj)
    if (limpo.length !== 14) return setErro('Digita um CNPJ válido (14 números).')

    setBuscando(true)
    try {
      setDados(await buscarCnpj(limpo))
    } catch (err) {
      setErro(err.message)
    } finally {
      setBuscando(false)
    }
  }

  function dadosEmpresa() {
    const est = dados?.estabelecimento
    return {
      cnpj: formatarCnpj(est?.cnpj || dados?.cnpj || cnpj),
      razao_social: dados?.razao_social || '',
      nome_fantasia: est?.nome_fantasia || '',
      endereco: montarEndereco(est),
      telefone: est?.telefone1 ? `(${est.ddd1 || ''}) ${est.telefone1}` : '',
      email: est?.email || '',
      situacao: est?.situacao_cadastral || '',
      data_abertura: formatarDataBr(est?.data_inicio_atividade),
      atividade_principal: est?.atividade_principal?.descricao || '',
      uf: est?.estado?.sigla || '',
    }
  }

  async function registrarVendaNaoFeita() {
    setSalvando(true)
    const empresa = dadosEmpresa()
    await supabase.from('vendas_cnpj').insert({
      ...empresa,
      status: 'venda_nao_feita',
      solicitado_por: profile.id,
    })
    setSalvando(false)
    limparTudo()
  }

  function tituloValido() {
    if (titularTipo === 'pf') return soDigitos(titularCpf).length === 11 && titularNomePf.trim()
    return soDigitos(titularCnpj).length === 14 && titularRazaoSocial.trim()
  }

  async function salvarVendaFeita(e) {
    e?.preventDefault()
    if (!tituloValido()) {
      return setErro(
        titularTipo === 'pf' ? 'Preenche o CPF (11 números) e o nome do titular.' : 'Preenche o CNPJ (14 números) e a Razão Social do titular.'
      )
    }
    setSalvando(true)
    setErro('')
    const empresa = dadosEmpresa()
    const payload = {
      ...empresa,
      status: 'venda_feita',
      quantidade_linhas: Number(quantidadeLinhas) || null,
      numeros_linhas: numerosLinhas,
      tipo_linha: tipoLinha,
      plano,
      titular_tipo: titularTipo,
      titular_documento: titularTipo === 'pf' ? soDigitos(titularCpf) : soDigitos(titularCnpj),
      titular_nome: titularTipo === 'pf' ? titularNomePf.trim() : titularRazaoSocial.trim(),
      solicitado_por: profile.id,
    }
    const { data, error } = await supabase.from('vendas_cnpj').insert(payload).select().single()
    setSalvando(false)
    if (error) return setErro('Erro ao salvar: ' + error.message)
    setVendaSalva(data)
  }

  const empresa = dados ? dadosEmpresa() : null
  const bloqueado = empresa ? situacaoBloqueada(empresa.situacao) : false

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={consultar} className="flex items-center gap-2">
        <input
          className="field-input flex-1"
          placeholder="Digita ou cola o CNPJ (00.000.000/0000-00)"
          value={formatarCnpj(cnpj)}
          onChange={(e) => setCnpj(soDigitos(e.target.value).slice(0, 14))}
        />
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={buscando}>
          {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}

      {empresa && !vendaSalva && (
        <div className="card flex flex-col gap-2 p-3">
          <div>
            <p className="text-base font-bold text-ink">{empresa.razao_social || '(sem razão social)'}</p>
            {empresa.nome_fantasia && <p className="text-xs text-muted">{empresa.nome_fantasia}</p>}
          </div>

          {bloqueado && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              CNPJ {empresa.situacao?.toUpperCase()} — não vender pra esse cliente.
            </div>
          )}

          <div className="flex flex-col">
            <Campo label="CNPJ" valor={empresa.cnpj} />
            <Campo label="Situação" valor={empresa.situacao} />
            <Campo label="Aberta desde" valor={empresa.data_abertura} />
            <Campo label="Atividade" valor={empresa.atividade_principal} />
            <Campo label="Endereço" valor={empresa.endereco} />
            <Campo label="Telefone" valor={empresa.telefone} />
            <Campo label="E-mail" valor={empresa.email} />
          </div>

          {!mostrarFormVenda && (
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setMostrarFormVenda(true)}
                disabled={bloqueado}
                title={bloqueado ? 'CNPJ suspenso/inapto — não dá pra vender' : undefined}
              >
                Venda feita
              </button>
              <button type="button" className="btn-ghost" onClick={registrarVendaNaoFeita} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Venda não feita'}
              </button>
            </div>
          )}

          {mostrarFormVenda && (
            <form onSubmit={salvarVendaFeita} className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                  Quantidade de linhas
                  <input
                    type="number"
                    min="1"
                    className="field-input"
                    value={quantidadeLinhas}
                    onChange={(e) => setQuantidadeLinhas(e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                  Linha nova ou portabilidade?
                  <select className="field-input" value={tipoLinha} onChange={(e) => setTipoLinha(e.target.value)}>
                    <option value="nova">Linha nova</option>
                    <option value="portabilidade">Portabilidade</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                  Plano
                  <select className="field-input" value={plano} onChange={(e) => setPlano(e.target.value)}>
                    {PLANOS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Número(s) da(s) linha(s)
                <textarea
                  className="field-input min-h-14 resize-y"
                  placeholder="Ex: 11999990000 — um por linha, se for mais de um número"
                  value={numerosLinhas}
                  onChange={(e) => setNumerosLinhas(e.target.value)}
                />
              </label>

              <div className="rounded-lg border border-line p-2">
                <p className="mb-1.5 text-xs font-semibold text-ink">Titular da linha</p>
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    className={titularTipo === 'pf' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                    onClick={() => setTitularTipo('pf')}
                  >
                    Pessoa Física
                  </button>
                  <button
                    type="button"
                    className={titularTipo === 'pj' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                    onClick={() => setTitularTipo('pj')}
                  >
                    Pessoa Jurídica
                  </button>
                </div>

                {titularTipo === 'pf' ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                      CPF do titular
                      <input
                        className="field-input"
                        placeholder="000.000.000-00"
                        value={formatarCpf(titularCpf)}
                        onChange={(e) => setTitularCpf(soDigitos(e.target.value).slice(0, 11))}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                      Nome do titular
                      <input
                        className="field-input"
                        placeholder="Nome completo"
                        value={titularNomePf}
                        onChange={(e) => setTitularNomePf(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                      Razão Social do titular
                      <input
                        className="field-input"
                        placeholder="Razão Social Ltda"
                        value={titularRazaoSocial}
                        onChange={(e) => setTitularRazaoSocial(e.target.value)}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                      CNPJ do titular
                      <input
                        className="field-input"
                        placeholder="00.000.000/0000-00"
                        value={formatarCnpj(titularCnpj)}
                        onChange={(e) => setTitularCnpj(soDigitos(e.target.value).slice(0, 14))}
                        required
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar venda'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMostrarFormVenda(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {vendaSalva && (
        <div className="card flex flex-col gap-1 p-3">
          <p className="mb-1 text-base font-bold text-ink">Ficha da venda — pronta pra cadastrar</p>
          <p className="mb-1 text-xs text-muted">Clica no ícone ao lado de cada campo pra copiar o valor.</p>
          <Campo comCopiar label="CNPJ" valor={vendaSalva.cnpj} />
          <Campo comCopiar label="Razão Social" valor={vendaSalva.razao_social} />
          <Campo comCopiar label="Nome Fantasia" valor={vendaSalva.nome_fantasia} />
          <Campo comCopiar label="Situação" valor={vendaSalva.situacao} />
          <Campo comCopiar label="Aberta desde" valor={vendaSalva.data_abertura} />
          <Campo comCopiar label="Atividade" valor={vendaSalva.atividade_principal} />
          <Campo comCopiar label="Endereço" valor={vendaSalva.endereco} />
          <Campo comCopiar label="Telefone" valor={vendaSalva.telefone} />
          <Campo comCopiar label="E-mail" valor={vendaSalva.email} />
          <Campo comCopiar label="Titular" valor={vendaSalva.titular_tipo === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'} />
          <Campo
            comCopiar
            label={vendaSalva.titular_tipo === 'pj' ? 'CNPJ do titular' : 'CPF do titular'}
            valor={vendaSalva.titular_tipo === 'pj' ? formatarCnpj(vendaSalva.titular_documento) : formatarCpf(vendaSalva.titular_documento)}
          />
          <Campo
            comCopiar
            label={vendaSalva.titular_tipo === 'pj' ? 'Razão Social do titular' : 'Nome do titular'}
            valor={vendaSalva.titular_nome}
          />
          <Campo comCopiar label="Quantidade de linhas" valor={vendaSalva.quantidade_linhas} />
          <Campo comCopiar label="Número(s)" valor={vendaSalva.numeros_linhas} />
          <Campo comCopiar label="Tipo" valor={vendaSalva.tipo_linha === 'portabilidade' ? 'Portabilidade' : 'Linha nova'} />
          <Campo comCopiar label="Plano" valor={vendaSalva.plano} />
          <button type="button" className="btn-primary mt-3 self-start" onClick={limparTudo}>
            Nova consulta
          </button>
        </div>
      )}
    </div>
  )
}
