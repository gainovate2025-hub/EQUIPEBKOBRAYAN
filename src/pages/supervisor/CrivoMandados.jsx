import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Secao from '../../components/ui/Secao'
import { Copy, Search } from 'lucide-react'

// Aba "CNPJs mandados" do Crivo (13/11/2026, pedido do Brayan): lista todo
// CNPJ que foi mandado no chat do Crivo, de qualquer login, com quem mandou,
// a hora, o resultado e o PC. Dá pra escolher o dia ou procurar um CNPJ
// (procurar um CNPJ olha todos os dias).

const LIMITE = 1000

function soDigitos(v) {
  return (v || '').replace(/\D/g, '')
}

function formatarCnpj(v) {
  const d = soDigitos(v)
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v
}

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Mesmo veredito do chat: reprovado em qualquer sistema decide; CNPJ errado
// em qualquer um vira aviso; só é aprovado com os dois aprovados.
function resultado(c) {
  if (c.status === 'erro') return { texto: 'Erro', classe: 'badge-bad' }
  const s1 = c.sistema1_resultado
  const s2 = c.sistema2_resultado
  if (s1 === 'reprovado' || s2 === 'reprovado') return { texto: 'Reprovado', classe: 'badge-bad' }
  if (s1 === 'nao_encontrado' || s2 === 'nao_encontrado') return { texto: 'CNPJ errado', classe: 'badge border-warn-border bg-warn-bg text-warn-text' }
  if (s1 === 'aprovado' && s2 === 'aprovado') return { texto: 'Aprovado', classe: 'badge-ok' }
  if (c.status === 'pendente') return { texto: 'Aguardando', classe: 'badge-neutral' }
  return { texto: c.status, classe: 'badge-neutral' }
}

export default function CrivoMandados() {
  const [dia, setDia] = useState(hojeLocal)
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  const digitosBusca = soDigitos(busca)

  const carregar = useCallback(async () => {
    setErro('')
    let query = supabase
      .from('crivo_consultas')
      .select('id, cnpj, status, created_at, pc, sistema1_resultado, sistema2_resultado, profiles(name, username)')
      .order('created_at', { ascending: false })
      .limit(LIMITE)
    if (digitosBusca) {
      query = query.ilike('cnpj', `%${digitosBusca}%`)
    } else {
      const inicio = new Date(`${dia}T00:00:00`)
      const fim = new Date(inicio)
      fim.setDate(fim.getDate() + 1)
      query = query.gte('created_at', inicio.toISOString()).lt('created_at', fim.toISOString())
    }
    const { data, error } = await query
    if (error) setErro(error.message)
    setLista(data || [])
    setCarregando(false)
  }, [dia, digitosBusca])

  useEffect(() => {
    setCarregando(true)
    const t = setTimeout(carregar, 300) // espera parar de digitar
    return () => clearTimeout(t)
  }, [carregar])

  // Atualiza sozinho a cada 10s pra ver os CNPJs novos chegando.
  useEffect(() => {
    const t = setInterval(carregar, 10000)
    return () => clearInterval(t)
  }, [carregar])

  const contagem = lista.reduce((acc, c) => {
    const r = resultado(c).texto
    acc[r] = (acc[r] || 0) + 1
    return acc
  }, {})

  async function copiarLista() {
    const texto = lista
      .slice()
      .reverse()
      .map((c) => `${soDigitos(c.cnpj)} - ${resultado(c).texto.toUpperCase()}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro('Não consegui copiar. Selecione a lista e copie na mão.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Secao titulo="CNPJs mandados no chat">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col">
            <span className="mb-1.5 block text-xs font-medium text-muted">Dia</span>
            <input
              type="date"
              className="field-input"
              value={dia}
              max={hojeLocal()}
              onChange={(e) => setDia(e.target.value || hojeLocal())}
              disabled={!!digitosBusca}
            />
          </label>
          <label className="flex flex-1 flex-col">
            <span className="mb-1.5 block text-xs font-medium text-muted">Procurar CNPJ (olha todos os dias)</span>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="field-input pl-9"
                placeholder="Ex: 45.374.524/0001-80"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </label>
          <button type="button" className="btn-outline px-4 py-2" onClick={copiarLista} disabled={!lista.length}>
            <Copy size={15} /> {copiado ? 'Copiado!' : 'Copiar lista'}
          </button>
        </div>

        <p className="mt-3 text-sm text-muted">
          {carregando
            ? 'Carregando…'
            : digitosBusca
              ? `${lista.length} consulta(s) com esse CNPJ.`
              : `${lista.length} CNPJ(s) mandado(s) nesse dia${lista.length >= LIMITE ? ' (mostrando os últimos ' + LIMITE + ')' : ''}.`}
          {!carregando && lista.length > 0 && (
            <> {Object.entries(contagem).map(([k, v]) => `${k}: ${v}`).join(' · ')}</>
          )}
        </p>
        {erro && <p className="mt-2 text-sm font-medium text-bad-text" role="alert">{erro}</p>}

        {!carregando && lista.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {digitosBusca ? 'Esse CNPJ nunca foi mandado no chat.' : 'Nenhum CNPJ mandado nesse dia.'}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3">{digitosBusca ? 'Dia e hora' : 'Hora'}</th>
                  <th className="py-1 pr-3">CNPJ</th>
                  <th className="py-1 pr-3">Quem mandou</th>
                  <th className="py-1 pr-3">Resultado</th>
                  <th className="py-1">PC</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const r = resultado(c)
                  const quando = new Date(c.created_at)
                  return (
                    <tr key={c.id} className="border-t border-divider">
                      <td className="whitespace-nowrap py-1.5 pr-3">
                        {digitosBusca ? quando.toLocaleString('pt-BR') : quando.toLocaleTimeString('pt-BR')}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 font-mono">{formatarCnpj(c.cnpj)}</td>
                      <td className="py-1.5 pr-3">
                        {c.profiles?.name || '—'}
                        {c.profiles?.username && <span className="text-xs text-muted"> ({c.profiles.username})</span>}
                      </td>
                      <td className="py-1.5 pr-3"><span className={r.classe}>{r.texto}</span></td>
                      <td className="py-1.5">{c.pc ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  )
}
