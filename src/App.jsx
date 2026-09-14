import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './lib/ProtectedRoute'
import Login from './pages/Login'

import SupervisorLayout from './pages/supervisor/Layout'
import SupervisorDashboard from './pages/supervisor/Dashboard'
import SupervisorComissao from './pages/supervisor/Comissao'
import SupervisorContestacoes from './pages/supervisor/Contestacoes'
import SupervisorReagendamentos from './pages/supervisor/Reagendamentos'
import SupervisorObjetivos from './pages/supervisor/Objetivos'
import SupervisorNotas from './pages/supervisor/Notas'
import SupervisorEquipe from './pages/supervisor/Equipe'
import SupervisorConfiguracoes from './pages/supervisor/Configuracoes'
import SupervisorAprovacao from './pages/supervisor/Aprovacao'
import SupervisorCrivo from './pages/supervisor/Crivo'
import SupervisorAutomacoes from './pages/supervisor/Automacoes'

import BkoLayout from './pages/bko/Layout'
import BkoDashboard from './pages/bko/Dashboard'
import BkoContestacoes from './pages/bko/Contestacoes'
import BkoReagendamentos from './pages/bko/Reagendamentos'
import BkoComissao from './pages/bko/Comissao'
import BkoObjetivo from './pages/bko/Objetivo'
import BkoNotas from './pages/bko/Notas'
import BkoRegistroDiario from './pages/bko/RegistroDiario'
import Garagem from './pages/Garagem'
import Corrida from './pages/Corrida'
import Desafios from './pages/Desafios'
import Ranking from './pages/Ranking'
import TeamChat from './pages/TeamChat'

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
        <Route path="comissao" element={<SupervisorComissao />} />
        <Route path="contestacoes" element={<SupervisorContestacoes />} />
        <Route path="reagendamentos" element={<SupervisorReagendamentos />} />
        <Route path="objetivos" element={<SupervisorObjetivos />} />
        <Route path="notas" element={<SupervisorNotas />} />
        <Route path="equipe" element={<SupervisorEquipe />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="chat" element={<TeamChat />} />
        <Route path="garagem" element={<Garagem />} />
        <Route path="corrida" element={<Corrida />} />
        <Route path="desafios" element={<Desafios />} />
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
        <Route path="registro-diario" element={<BkoRegistroDiario />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="chat" element={<TeamChat />} />
        <Route path="comissao" element={<BkoComissao />} />
        <Route path="objetivo" element={<BkoObjetivo />} />
        <Route path="notas" element={<BkoNotas />} />
        <Route path="garagem" element={<Garagem />} />
        <Route path="corrida" element={<Corrida />} />
        <Route path="desafios" element={<Desafios />} />
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
        <Route path="chat" element={<TeamChat />} />
        <Route path="configuracoes" element={<OperacaoConfiguracoes />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
