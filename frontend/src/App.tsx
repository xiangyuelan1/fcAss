import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import AppLayout from './components/Layout'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import Dashboard from './pages/Dashboard'
import DataManagement from './pages/DataManagement'
import FeatureEngineering from './pages/FeatureEngineering'
import ModelBuilder from './pages/ModelBuilder'
import ModelList from './pages/ModelList'
import TrainingTasks from './pages/TrainingTasks'
import BacktestResults from './pages/BacktestResults'
import Prediction from './pages/Prediction'
import PaymentConfig from './pages/PaymentConfig'
import LoginPage from './pages/Login'
import { useAuthStore } from './store'

const App: React.FC = () => {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const [initializing, setInitializing] = React.useState(true)

  useEffect(() => {
    const init = async () => {
      await checkAuth()
      setInitializing(false)
    }
    init()
  }, [checkAuth])

  if (initializing) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <Router>
      {isAuthenticated ? (
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/data" element={<DataManagement />} />
            <Route path="/features" element={<FeatureEngineering />} />
            <Route path="/models" element={<ModelList />} />
            <Route path="/models/build" element={<ModelBuilder />} />
            <Route path="/models/build/:id" element={<ModelBuilder />} />
            <Route path="/training" element={<TrainingTasks />} />
            <Route path="/backtest" element={<BacktestResults />} />
            <Route path="/prediction" element={<Prediction />} />
            <Route path="/payment-config" element={<PaymentConfig />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
      <PWAInstallPrompt />
      <PWAUpdatePrompt />
    </Router>
  )
}

export default App
