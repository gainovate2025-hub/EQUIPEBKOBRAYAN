import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { fetchModuloConfig, updateModuloConfig, listarAbasPlanilha } from '../../lib/api'
import Field from '../ui/Field'
import Toast from '../ui/Toast'
import { useToast } from '../../lib/useToast'

// Configuração da planilha de vendas (10/11/2026): link + aba onde cada
// ficha salva na tela "Consulta CNPJ e venda" entra numa linha nova.
// As colunas são achadas pelo nome do cabeçalho (veja COLUNAS_VENDA em
// src/lib/api.js); aba vazia ganha o cabeçalho sozinha.
export default function PlanilhaVendasForm() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [semMigration, setSemMigration] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [abaNome, setAbaNome] = useState('')
  const [abas, setAbas] = useState(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    fetchModuloConfig('vendas')
      .then((c) => {
        setSheetUrl(c.sheet_url || '')
        setAbaNome(c.aba_nome || '')
      })
      .catch(() => setSemMigration(true))
      .finally(() => setCarregando(false))
  }, [])

  async function buscarAbas() {
    setBuscando(true)
    try {
      setAbas(await listarAbasPlanilha(sheetUrl))
    } catch (err) {
      showToast(err.message || 'Falha ao buscar abas.', 'error')
    } finally {
      setBuscando(false)
    }
  }

  async function salvar(e) {
    e.preventDefault()
    if (!sheetUrl.trim()) return showToast('Cole o link da planilha.', 'error')
    if (!abaNome.trim()) return showToast('Escolha a aba.', 'error')
    setSalvando(true)
    try {
      await updateModuloConfig('vendas', profile.id, { sheet_url: sheetUrl.trim(), aba_nome: abaNome.trim() })
      showToast('Planilha de vendas salva. As próximas fichas já entram nela.')
    } catch (err) {
      showToast(err.message || 'Falha ao salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <p className="text-sm text-muted">Carregando…</p>
  if (semMigration) {
    return (
      <p className="tim-alert">
        Falta rodar o arquivo supabase/migration_050_planilha_vendas.sql no SQL Editor do Supabase.
      </p>
    )
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Cada ficha salva em "Consulta CNPJ e venda" entra numa linha nova dessa planilha. As colunas são achadas pelo nome do
        cabeçalho (linha 1): DATA, CNPJ, RAZÃO SOCIAL, NOME DO CLIENTE, CPF, NÚMERO, OPERADORA, E-MAIL, ENDEREÇO, PONTO DE
        REFERÊNCIA, PLANO, QTD LINHAS, LINHAS, CAPTADOR, OPERADOR. Se a aba estiver vazia, o painel cria esse cabeçalho.
      </p>
      <Field label="Link da planilha">
        <div className="flex gap-2">
          <input
            className="field-input flex-1"
            placeholder="Cole o link da planilha do Google Sheets"
            value={sheetUrl}
            onChange={(e) => { setSheetUrl(e.target.value); setAbas(null) }}
          />
          <button type="button" className="btn-ghost btn-sm shrink-0" disabled={buscando || !sheetUrl.trim()} onClick={buscarAbas}>
            {buscando ? 'Buscando…' : 'Buscar abas'}
          </button>
        </div>
      </Field>
      <Field label="Aba">
        {abas ? (
          <select className="field-input" value={abaNome} onChange={(e) => setAbaNome(e.target.value)}>
            <option value="">Selecione…</option>
            {abas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : (
          <input className="field-input" placeholder="Clique em Buscar abas" value={abaNome} onChange={(e) => setAbaNome(e.target.value)} />
        )}
      </Field>
      <p className="text-xs text-muted">
        Antes, compartilhe a planilha como <strong>Editor</strong> com <strong>painel-bko-sheet@painel-bko.iam.gserviceaccount.com</strong>.
      </p>
      <button type="submit" className="btn-primary self-start" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar planilha de vendas'}
      </button>
      <Toast toast={toast} />
    </form>
  )
}
