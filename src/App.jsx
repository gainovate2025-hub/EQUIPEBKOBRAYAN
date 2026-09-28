import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './lib/ProtectedRoute'
import Login from './pages/Login'

import SupervisorLayout from './pages/supervisor/Layout'
import SupervisorDashboard from './pages/supervisor/Dashboard'
import SupervisorComissao from './pages/supervisor/Comissao'
import SupervisorContestacoes from './pages/supervisor/Contestacoes'
import SupervisorReagendamentos from './pages/supervisor/Reagendamentos'
import SupervisorEquipe from './pages/supervisor/Equipe'
import SupervisorConfiguracoes from './pages/supervisor/Configuracoes'
import SupervisorAprovacao from './pages/supervisor/Aprovacao'
import SupervisorCustCodes from './pages/supervisor/CustCodes'
import SupervisorCrivo from './pages/supervisor/Crivo'
import SupervisorAutomacoes from './pages/supervisor/Automacoes'
import SupervisorRelatorios from './pages/supervisor/Relatorios'
import SupervisorFaturas from './pages/supervisor/Faturas'

import BkoLayout from './pages/bko/Layout'
import BkoDashboard from './pages/bko/Dashboard'
import BkoContestacoes from './pages/bko/Contestacoes'
import BkoReagendamentos from './pages/bko/Reagendamentos'
import BkoComissao from './pages/bko/Comissao'
import BkoFaturas from './pages/bko/Faturas'
import CasosWhatsapp from './pages/CasosWhatsapp'
import Ranking from './pages/Ranking'

import OperacaoLayout from './pages/operacao/Layout'
import OperacaoConfiguracoes from './pages/supervisor/Configuracoes'

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
        <Route path="aprovacao" element={<SupervisorAprovacao />} />
        <Route path="cust-codes" element={<SupervisorCustCodes />} />
        <Route path="comissao" element={<SupervisorComissao />} />
        <Route path="contestacoes" element={<SupervisorContestacoes />} />
        <Route path="reagendamentos" element={<SupervisorReagendamentos />} />
        <Route path="faturas" element={<SupervisorFaturas />} />
        <Route path="casos-whatsapp" element={<CasosWhatsapp />} />
        <Route path="relatorios" element={<SupervisorRelatorios />} />
        <Route path="equipe" element={<SupervisorEquipe />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="crivo" element={<SupervisorCrivo />} />
        <Route path="automacoes" element={<SupervisorAutomacoes />} />
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
        <Route path="contestacoes" element={<BkoContestacoes />} />
        <Route path="reagendamentos" element={<BkoReagendamentos />} />
        <Route path="faturas" element={<BkoFaturas />} />
        <Route path="casos-whatsapp" element={<CasosWhatsapp />} />
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
        <Route index element={<SupervisorCrivo />} />
        <Route path="configuracoes" element={<OperacaoConfiguracoes />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
