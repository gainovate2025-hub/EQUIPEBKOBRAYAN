import { useState } from 'react'
import { Search, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { consultarOperadora } from '../../lib/api'
import { Campo } from '../../components/vendaCnpj/Campo'
import { soDigitos, formatarCnpj, formatarCpf } from '../../lib/documentos'

// RASCUNHO (26/10/2026) — ver supabase/migration_025_vendas_cnpj.sql e
// seguintes (principalmente migration_040) pro contexto completo.

function semAcento(v) {
  return (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Só o plano real que o Brayan mandou (print em 26/10/2026) — antes
// tinha 3 chutes (R$50/70/100), tirados a pedido dele.
const PLANOS = ['BLACKFRIDAY 80GB R$53,99']

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

function linhaVazia() {
  return {
    numero: '',
    numeroConsultado: null, // último número que já foi consultado, evita reconsultar à toa
    tipo: 'nova', // 'nova' | 'portabilidade'
    titularTipo: 'pf', // 'pf' | 'pj'
    titularCpf: '',
    titularNomePf: '',
    titularRazaoSocial: '',
    titularCnpj: '',
    tipoChip: 'fisico', // 'fisico' | 'esim'
    consultando: false,
    operadora: null,
    operadoraBruta: null,
    portado: null,
    erroOperadora: null,
  }
}

function linhaValida(l) {
  const titularOk = l.titularTipo === 'pf'
    ? soDigitos(l.titularCpf).length === 11 && l.titularNomePf.trim()
    : soDigitos(l.titularCnpj).length === 14 && l.titularRazaoSocial.trim()
  if (!titularOk) return false
  if (l.tipo === 'portabilidade') {
    const d = soDigitos(l.numero)
    if (d.length !== 10 && d.length !== 11) return false
  }
  return true
}

// Um cartão por linha vendida — tipo, titular (PF/PJ) e, se for
// portabilidade, o número + consulta automática da operadora.
function LinhaForm({ indice, linha, atualizar }) {
  function set(campo, valor) {
    atualizar(indice, { ...linha, [campo]: valor })
  }

  // Consulta sozinha assim que o número digitado fica completo — não
  // precisa de botão. Dispara no onChange quando chega a 11 dígitos
  // (celular, o formato mais comum) e no onBlur como reforço pra números
  // de 10 (caso a pessoa saia do campo sem completar os 11).
  async function consultarEssaOperadora(numeroDigitado) {
    const numeroLimpo = soDigitos(numeroDigitado)
    if (numeroLimpo.length !== 10 && numeroLimpo.length !== 11) return
    if (numeroLimpo === linha.numeroConsultado) return // já consultou esse mesmo número
    atualizar(indice, { ...linha, numero: numeroLimpo, consultando: true, erroOperadora: null })
    try {
      const r = await consultarOperadora(numeroLimpo)
      atualizar(indice, {
        ...linha,
        numero: numeroLimpo,
        numeroConsultado: numeroLimpo,
        consultando: false,
        operadora: r.operadora,
        operadoraBruta: r.operadoraBruta,
        portado: r.portado,
      })
    } catch (err) {
      atualizar(indice, { ...linha, numero: numeroLimpo, consultando: false, erroOperadora: err.message })
    }
  }

  function aoMudarNumero(valor) {
    const digitos = soDigitos(valor).slice(0, 11)
    set('numero', digitos)
    if (digitos.length === 11) consultarEssaOperadora(digitos)
  }

  function aoSairDoNumero() {
    if (linha.numero.length === 10) consultarEssaOperadora(linha.numero)
  }

  return (
    <div className="rounded-lg border border-line p-2">
      <p className="mb-1.5 text-xs font-semibold text-ink">Linha {indice + 1}</p>

      <label className="mb-2 flex flex-col gap-1 text-xs font-medium text-muted">
        Linha nova ou portabilidade?
        <select className="field-input" value={linha.tipo} onChange={(e) => set('tipo', e.target.value)}>
          <option value="nova">Linha nova</option>
          <option value="portabilidade">Portabilidade</option>
        </select>
      </label>

      <div className="mb-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Número (DDD + número)
            <input
              className="field-input"
              placeholder="Ex: 11999990000"
              value={linha.numero}
              onChange={(e) => aoMudarNumero(e.target.value)}
              onBlur={aoSairDoNumero}
            />
          </label>
          {linha.consultando && <p className="mt-1 text-xs text-muted">Consultando operadora…</p>}
          {linha.erroOperadora && <p className="mt-1 text-xs text-red-600">{linha.erroOperadora}</p>}
          {linha.operadora === 'TIM' && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-700">
              <AlertTriangle size={12} /> TIM — atenção, não fazemos TIM pra TIM
            </p>
          )}
          {linha.operadora && linha.operadora !== 'TIM' && (
            <p className="mt-1 text-xs text-muted">
              Operadora: <span className="font-medium text-ink">{linha.operadora}</span>
              {linha.portado === true && ' (já portado)'}
            </p>
          )}
      </div>

      <div className="mb-1.5 flex gap-2">
        <button
          type="button"
          className={linha.titularTipo === 'pf' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
          onClick={() => set('titularTipo', 'pf')}
        >
          Titular Pessoa Física
        </button>
        <button
          type="button"
          className={linha.titularTipo === 'pj' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
          onClick={() => set('titularTipo', 'pj')}
        >
          Titular Pessoa Jurídica
        </button>
      </div>

      {linha.titularTipo === 'pf' ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            CPF do titular
            <input
              className="field-input"
              placeholder="000.000.000-00"
              value={formatarCpf(linha.titularCpf)}
              onChange={(e) => set('titularCpf', soDigitos(e.target.value).slice(0, 11))}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Nome do titular
            <input
              className="field-input"
              placeholder="Nome completo"
              value={linha.titularNomePf}
              onChange={(e) => set('titularNomePf', e.target.value)}
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
              value={linha.titularRazaoSocial}
              onChange={(e) => set('titularRazaoSocial', e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            CNPJ do titular
            <input
              className="field-input"
              placeholder="00.000.000/0000-00"
              value={formatarCnpj(linha.titularCnpj)}
              onChange={(e) => set('titularCnpj', soDigitos(e.target.value).slice(0, 14))}
              required
            />
          </label>
        </div>
      )}

      <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-muted">
        Tipo de chip
        <select className="field-input" value={linha.tipoChip} onChange={(e) => set('tipoChip', e.target.value)}>
          <option value="fisico">Chip físico</option>
          <option value="esim">eSIM</option>
        </select>
      </label>
    </div>
  )
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

  const [quantidadeLinhas, setQuantidadeLinhas] = useState(1)
  const [linhas, setLinhas] = useState([linhaVazia()])
  const [plano, setPlano] = useState(PLANOS[0])
  const [pontoReferencia, setPontoReferencia] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [emailCliente, setEmailCliente] = useState('')
  const [cpfCliente, setCpfCliente] = useState('')
  const [telefoneCliente, setTelefoneCliente] = useState('')
  const [captador, setCaptador] = useState('')
  const [fechouVenda, setFechouVenda] = useState(profile?.name || '')

  function atualizarQuantidade(valorBruto) {
    const n = Math.max(1, Math.min(10, Number(valorBruto) || 1))
    setQuantidadeLinhas(n)
    setLinhas((atual) => {
      const novas = [...atual]
      while (novas.length < n) novas.push(linhaVazia())
      novas.length = n
      return novas
    })
  }

  function atualizarLinha(indice, novaLinha) {
    setLinhas((atual) => atual.map((l, i) => (i === indice ? novaLinha : l)))
  }

  function limparTudo() {
    setCnpj('')
    setDados(null)
    setErro('')
    setMostrarFormVenda(false)
    setVendaSalva(null)
    setQuantidadeLinhas(1)
    setLinhas([linhaVazia()])
    setPlano(PLANOS[0])
    setPontoReferencia('')
    setNomeCliente('')
    setEmailCliente('')
    setCpfCliente('')
    setTelefoneCliente('')
    setCaptador('')
    setFechouVenda(profile?.name || '')
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

  function linhasValidas() {
    return linhas.every(linhaValida)
  }

  function linhasParaSalvar() {
    return linhas.map((l) => ({
      numero: soDigitos(l.numero) || null,
      tipo: l.tipo,
      tipo_chip: l.tipoChip,
      titular_tipo: l.titularTipo,
      titular_documento: l.titularTipo === 'pf' ? soDigitos(l.titularCpf) : soDigitos(l.titularCnpj),
      titular_nome: l.titularTipo === 'pf' ? l.titularNomePf.trim() : l.titularRazaoSocial.trim(),
      operadora: l.operadora,
      operadora_bruta: l.operadoraBruta,
      portado: l.portado,
    }))
  }

  async function salvarVendaFeita(e) {
    e?.preventDefault()
    if (!linhasValidas()) {
      return setErro('Preenche o titular (CPF+nome ou CNPJ+Razão Social) de cada linha, e o número de quem for portabilidade.')
    }
    setSalvando(true)
    setErro('')
    const empresa = dadosEmpresa()
    const payload = {
      ...empresa,
      status: 'venda_feita',
      quantidade_linhas: linhas.length,
      linhas: linhasParaSalvar(),
      plano,
      ponto_referencia: pontoReferencia.trim() || null,
      nome_cliente: nomeCliente.trim() || null,
      email_cliente: emailCliente.trim() || null,
      cpf_cliente: soDigitos(cpfCliente) || null,
      telefone_cliente: soDigitos(telefoneCliente) || null,
      captador: captador.trim() || null,
      fechou_venda: fechouVenda.trim() || null,
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
            <form onSubmit={salvarVendaFeita} className="mt-1 flex flex-col gap-4 border-t border-line pt-3">
              <section className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Dados do cliente</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Nome do cliente
                    <input
                      className="field-input"
                      placeholder="Nome completo"
                      value={nomeCliente}
                      onChange={(e) => setNomeCliente(e.target.value)}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    CPF do cliente
                    <input
                      className="field-input"
                      placeholder="000.000.000-00"
                      value={formatarCpf(cpfCliente)}
                      onChange={(e) => setCpfCliente(soDigitos(e.target.value).slice(0, 11))}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Telefone do cliente (o que consta no 3C)
                    <input
                      className="field-input"
                      placeholder="Ex: 11999990000"
                      value={telefoneCliente}
                      onChange={(e) => setTelefoneCliente(soDigitos(e.target.value).slice(0, 11))}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    E-mail do cliente
                    <input
                      type="email"
                      className="field-input"
                      placeholder="cliente@exemplo.com"
                      value={emailCliente}
                      onChange={(e) => setEmailCliente(e.target.value)}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                    Ponto de referência
                    <input
                      className="field-input"
                      placeholder="Ex: perto do mercado São José"
                      value={pontoReferencia}
                      onChange={(e) => setPontoReferencia(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  O endereço de entrega é só o que consta no cartão CNPJ do cliente — não é liberada venda pra outro endereço.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Equipe</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Captador da venda
                    <input
                      className="field-input"
                      placeholder="Quem captou o cliente"
                      value={captador}
                      onChange={(e) => setCaptador(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Quem fechou a venda (Operador)
                    <input
                      className="field-input"
                      value={fechouVenda}
                      onChange={(e) => setFechouVenda(e.target.value)}
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Plano</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Quantidade de linhas
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="field-input"
                      value={quantidadeLinhas}
                      onChange={(e) => atualizarQuantidade(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                    Plano contratado
                    <select className="field-input" value={plano} onChange={(e) => setPlano(e.target.value)}>
                      {PLANOS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Linhas vendidas</p>
                <div className="flex flex-col gap-2">
                  {linhas.map((l, i) => (
                    <LinhaForm key={i} indice={i} linha={l} atualizar={atualizarLinha} />
                  ))}
                </div>
              </section>

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
          <Campo comCopiar label="Ponto de referência" valor={vendaSalva.ponto_referencia} />
          <Campo comCopiar label="Telefone (empresa)" valor={vendaSalva.telefone} />
          <Campo comCopiar label="E-mail (empresa)" valor={vendaSalva.email} />
          <Campo comCopiar label="Nome do cliente" valor={vendaSalva.nome_cliente} />
          <Campo comCopiar label="CPF do cliente" valor={vendaSalva.cpf_cliente ? formatarCpf(vendaSalva.cpf_cliente) : ''} />
          <Campo comCopiar label="Telefone do cliente (3C)" valor={vendaSalva.telefone_cliente} />
          <Campo comCopiar label="E-mail do cliente" valor={vendaSalva.email_cliente} />
          <Campo comCopiar label="Plano" valor={vendaSalva.plano} />
          <Campo comCopiar label="Captador da venda" valor={vendaSalva.captador} />
          <Campo comCopiar label="Quem fechou a venda" valor={vendaSalva.fechou_venda} />

          {(vendaSalva.linhas || []).map((l, i) => (
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

          <button type="button" className="btn-primary mt-3 self-start" onClick={limparTudo}>
            Nova consulta
          </button>
        </div>
      )}
    </div>
  )
}
