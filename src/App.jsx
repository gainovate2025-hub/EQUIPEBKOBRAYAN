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

import BkoLayout from './pages/bko/Layout'
import BkoDashboard from './pages/bko/Dashboard'
import BkoContestacoes from './pages/bko/Contestacoes'
import BkoReagendamentos from './pages/bko/Reagendamentos'
import BkoComissao from './pages/bko/Comissao'
import BkoObjetivo from './pages/bko/Objetivo'
import BkoNotas from './pages/bko/Notas'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/supervisor"
        element={
          <ProtectedRoute role="supervisor">
            <SupervisorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SupervisorDashboard />} />
        <Route path="comissao" element={<SupervisorComissao />} />
        <Route path="contestacoes" element={<SupervisorContestacoes />} />
        <Route path="reagendamentos" element={<SupervisorReagendamentos />} />
        <Route path="objetivos" element={<SupervisorObjetivos />} />
        <Route path="notas" element={<SupervisorNotas />} />
        <Route path="equipe" element={<SupervisorEquipe />} />
        <Route path="configuracoes" element={<SupervisorConfiguracoes />} />
      </Route>

      <Route
        path="/bko"
        element={
          <ProtectedRoute role="bko">
            <BkoLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<BkoDashboard />} />
        <Route path="contestacoes" element={<BkoContestacoes />} />
        <Route path="reagendamentos" element={<BkoReagendamentos />} />
        <Route path="comissao" element={<BkoComissao />} />
        <Route path="objetivo" element={<BkoObjetivo />} />
        <Route path="notas" element={<BkoNotas />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
