import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { fetchModuloConfig, updateModuloConfig, listarAbasPlanilha } from '../../lib/api'
import Field from '../ui/Field'
import Toast from '../ui/Toast'
import { useToast } from '../../lib/useToast'

export default function ModuloConfigForm({ modulo }) {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [abasDisponiveis, setAbasDisponiveis] = useState(null)
  const [buscandoAbas, setBuscandoAbas] = useState(false)
  const [abaNome, setAbaNome] = useState('')
  const [colunaNome, setColunaNome] = useState('')
  const [colunaCnpj, setColunaCnpj] = useState('')
  const [colunaCustcode, setColunaCustcode] = useState('')
  const [colunaTelefone, setColunaTelefone] = useState('')
  const [colunaStatus, setColunaStatus] = useState('')
  const [colunaProtocolo, setColunaProtocolo] = useState('')
  const [colunaVendedor, setColunaVendedor] = useState('')

  useEffect(() => {
    fetchModuloConfig(modulo)
      .then((config) => {
        setSheetUrl(config.sheet_url || '')
        setAbaNome(config.aba_nome || '')
        setColunaNome(config.coluna_nome || 'CLIENTE')
        setColunaCnpj(config.coluna_cnpj || 'CNPJ')
        setColunaCustcode(config.coluna_custcode || 'CUSTCODE')
        setColunaTelefone(config.coluna_telefone || 'TEL.PRINCIPAL')
        setColunaStatus(config.coluna_status || 'STATUS LINHA')
        setColunaProtocolo(config.coluna_protocolo || 'OBS')
        setColunaVendedor(config.coluna_vendedor || 'VENDEDOR')
      })
      .catch((err) => showToast(err.message || 'Falha ao carregar configuração.', 'error'))
      .finally(() => setCarregando(false))
  }, [modulo])

  async function buscarAbas() {
    setBuscandoAbas(true)
    try {
      const abas = await listarAbasPlanilha(sheetUrl)
      setAbasDisponiveis(abas)
      showToast('Abas carregadas.')
    } catch (err) {
      showToast(err.message || 'Falha ao buscar abas.', 'error')
    } finally {
      setBuscandoAbas(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!abaNome.trim()) return showToast('Preenche o nome da aba.', 'error')
    setSalvando(true)
    try {
      await updateModuloConfig(modulo, profile.id, {
        sheet_url: sheetUrl.trim(),
        aba_nome: abaNome.trim(),
        coluna_nome: colunaNome.trim() || 'CLIENTE',
        coluna_cnpj: colunaCnpj.trim() || 'CNPJ',
        coluna_custcode: colunaCustcode.trim() || 'CUSTCODE',
        coluna_telefone: colunaTelefone.trim() || 'TEL.PRINCIPAL',
        coluna_status: colunaStatus.trim() || 'STATUS LINHA',
        coluna_protocolo: colunaProtocolo.trim() || 'OBS',
        coluna_vendedor: colunaVendedor.trim() || 'VENDEDOR',
      })
      showToast('Configuração atualizada.')
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <p className="mt-4 text-sm text-muted">Carregando configuração…</p>

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <Field label="Link da planilha">
        <div className="flex gap-2">
          <input
            className="field-input flex-1"
            placeholder="Cole o link da planilha do Google Sheets"
            value={sheetUrl}
            onChange={(e) => { setSheetUrl(e.target.value); setAbasDisponiveis(null) }}
          />
          <button type="button" className="btn-ghost btn-sm shrink-0" disabled={buscandoAbas || !sheetUrl.trim()} onClick={buscarAbas}>
            {buscandoAbas ? 'Buscando…' : 'Buscar abas'}
          </button>
        </div>
      </Field>
      <Field label="Nome da aba (mês atual)">
        {abasDisponiveis ? (
          <select className="field-input" value={abaNome} onChange={(e) => setAbaNome(e.target.value)}>
            <option value="">Selecione…</option>
            {abasDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : (
          <input
            className="field-input"
            placeholder="Ex: JULHO2026"
            value={abaNome}
            onChange={(e) => setAbaNome(e.target.value)}
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Coluna do nome do cliente">
          <input className="field-input" placeholder="CLIENTE" value={colunaNome} onChange={(e) => setColunaNome(e.target.value)} />
        </Field>
        <Field label="Coluna do CNPJ">
          <input className="field-input" placeholder="CNPJ" value={colunaCnpj} onChange={(e) => setColunaCnpj(e.target.value)} />
        </Field>
        <Field label="Coluna do CustCode">
          <input className="field-input" placeholder="CUSTCODE" value={colunaCustcode} onChange={(e) => setColunaCustcode(e.target.value)} />
        </Field>
        <Field label="Coluna do telefone (WhatsApp)">
          <input className="field-input" placeholder="TEL.PRINCIPAL" value={colunaTelefone} onChange={(e) => setColunaTelefone(e.target.value)} />
        </Field>
        <Field label="Coluna do protocolo (contestação)">
          <input className="field-input" placeholder="OBS" value={colunaProtocolo} onChange={(e) => setColunaProtocolo(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Se trocar de planilha, precisa compartilhar ela (Editor) com <strong>painel-bko-sheet@painel-bko.iam.gserviceaccount.com</strong> antes de buscar as abas. Deixando o link em branco, usa a planilha padrão "Controle de fatura".
        Os nomes das colunas precisam bater exatamente com o cabeçalho (linha 1) da aba escolhida.
      </p>
      <button type="submit" className="btn-primary self-start" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar configuração'}
      </button>
      <Toast toast={toast} />
    </form>
  )
}
