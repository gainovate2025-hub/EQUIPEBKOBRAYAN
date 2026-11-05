import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './lib/ProtectedRoute'
import Login from './pages/Login'

import SupervisorLayout from './pages/supervisor/Layout'
import SupervisorDashboard from './pages/supervisor/Dashboard'
import SupervisorComissao from './pages/supervisor/Comissao'
import SupervisorConfiguracoes from './pages/supervisor/Configuracoes'
import SupervisorCrivo from './pages/supervisor/Crivo'
import SupervisorAutomacoes from './pages/supervisor/Automacoes'
import SupervisorVendasDesempenho from './pages/supervisor/VendasDesempenho'
import SupervisorComprovantes from './pages/supervisor/Comprovantes'
import SupervisorReagendamentos from './pages/supervisor/Reagendamentos'

import BkoLayout from './pages/bko/Layout'
import BkoDashboard from './pages/bko/Dashboard'
import BkoComissao from './pages/bko/Comissao'
import BkoFaturas from './pages/bko/Faturas'
import BkoComprovantes from './pages/bko/Comprovantes'
import BkoReagendamentos from './pages/bko/Reagendamentos'
import Ranking from './pages/Ranking'

import OperacaoLayout from './pages/operacao/Layout'
import OperacaoConfiguracoes from './pages/supervisor/Configuracoes'
import OperacaoVendaCnpj from './pages/operacao/VendaCnpj'
import OperacaoConsultaUnificada from './pages/operacao/ConsultaUnificada'

import CadastroLayout from './pages/cadastro/Layout'
import CadastroVendasParaCadastro from './pages/cadastro/VendasParaCadastro'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/supervisor"
        element={
          <ProtectedRoute roles={['supervisor', 'lider']}>
            <SupervisorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SupervisorDashboard />} />
        <Route path="comissao" element={<SupervisorComissao />} />
        <Route path="comprovantes" element={<SupervisorComprovantes />} />
        <Route path="reagendamentos" element={<SupervisorReagendamentos />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="crivo" element={<SupervisorCrivo />} />
        <Route path="automacoes" element={<SupervisorAutomacoes />} />
        <Route path="venda-cnpj" element={<OperacaoVendaCnpj />} />
        <Route path="vendas-desempenho" element={<SupervisorVendasDesempenho />} />
        <Route path="configuracoes" element={<SupervisorConfiguracoes />} />
      </Route>

      <Route
        path="/bko"
        element={
          <ProtectedRoute roles={['bko']}>
            <BkoLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<BkoDashboard />} />
        <Route path="faturas" element={<BkoFaturas />} />
        <Route path="comprovantes" element={<BkoComprovantes />} />
        <Route path="reagendamentos" element={<BkoReagendamentos />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="comissao" element={<BkoComissao />} />
      </Route>

      <Route
        path="/operacao"
        element={
          <ProtectedRoute roles={['operacao']}>
            <OperacaoLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OperacaoConsultaUnificada />} />
        <Route path="venda" element={<OperacaoVendaCnpj />} />
        <Route path="configuracoes" element={<OperacaoConfiguracoes />} />
      </Route>

      <Route
        path="/cadastro"
        element={
          <ProtectedRoute roles={['cadastro']}>
            <CadastroLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CadastroVendasParaCadastro />} />
        <Route path="configuracoes" element={<OperacaoConfiguracoes />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
