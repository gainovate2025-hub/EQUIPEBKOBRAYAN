import { useState } from 'react'
import Tabs from '../../components/ui/Tabs'
import SupervisorCrivo from '../supervisor/Crivo'
import VendaCnpj from './VendaCnpj'

// Junta "Consulta Crivo" e "Consulta CNPJ + Venda" numa tela só, com
// abas — pedido do Brayan em 26/10/2026 pra não precisar trocar de
// página toda hora entre as duas coisas que a operação usa o tempo todo.

const TABS = [
  { key: 'crivo', label: 'Consulta Crivo' },
  { key: 'venda', label: 'Consulta CNPJ + Venda' },
]

export default function ConsultaUnificada() {
  const [aba, setAba] = useState('crivo')

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} active={aba} onChange={setAba} />
      {aba === 'crivo' ? <SupervisorCrivo /> : <VendaCnpj />}
    </div>
  )
}
