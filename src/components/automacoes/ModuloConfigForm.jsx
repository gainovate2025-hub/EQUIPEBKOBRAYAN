import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { fetchModuloConfig, updateModuloConfig } from '../../lib/api'
import Field from '../ui/Field'
import Toast from '../ui/Toast'
import { useToast } from '../../lib/useToast'

export default function ModuloConfigForm({ modulo }) {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!abaNome.trim()) return showToast('Preenche o nome da aba.', 'error')
    setSalvando(true)
    try {
      await updateModuloConfig(modulo, profile.id, {
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
      <Field label="Nome da aba (mês atual)">
        <input
          className="field-input"
          placeholder="Ex: JULHO2026"
          value={abaNome}
          onChange={(e) => setAbaNome(e.target.value)}
        />
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
        <Field label="Coluna do status">
          <input className="field-input" placeholder="STATUS LINHA" value={colunaStatus} onChange={(e) => setColunaStatus(e.target.value)} />
        </Field>
        <Field label="Coluna do protocolo (contestação)">
          <input className="field-input" placeholder="OBS" value={colunaProtocolo} onChange={(e) => setColunaProtocolo(e.target.value)} />
        </Field>
        <Field label="Coluna do vendedor/responsável">
          <input className="field-input" placeholder="VENDEDOR" value={colunaVendedor} onChange={(e) => setColunaVendedor(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">Os nomes precisam bater exatamente com o cabeçalho (linha 1) da aba escolhida. A coluna do vendedor decide o que cada BKO vê — o nome na planilha precisa bater com o nome cadastrado no perfil dele.</p>
      <button type="submit" className="btn-primary self-start" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar configuração'}
      </button>
      <Toast toast={toast} />
    </form>
  )
}
