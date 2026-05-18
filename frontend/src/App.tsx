import React, { useEffect, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import AppLayout from './components/Layout'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import Dashboard from './pages/Dashboard'
import DataManagement from './pages/DataManagement'
import FeatureEngineering from './pages/FeatureEngineering'
import ModelList from './pages/ModelList'
import ModelBuilder from './pages/ModelBuilder'
import TrainingTasks from './pages/TrainingTasks'
import Prediction from './pages/Prediction'
import PaymentConfig from './pages/PaymentConfig'
import AdminUsers from './pages/AdminUsers'
import AdminConfig from './pages/AdminConfig'
import LoginPage from './pages/Login'
import WatchlistPage from './pages/Watchlist'
import { useAuthStore } from './store'

const Community = React.lazy(() => import('@/pages/Community'))
const PKArena = React.lazy(() => import('@/pages/PKArena'))
const Leaderboard = React.lazy(() => import('@/pages/Leaderboard'))
const CommunityModelDetail = React.lazy(() => import('@/pages/CommunityModelDetail'))
const Profile = React.lazy(() => import('@/pages/Profile'))
const ContactUs = React.lazy(() => import('@/pages/ContactUs'))
const AdminMessages = React.lazy(() => import('@/pages/AdminMessages'))
const DailyGuessPage = React.lazy(() => import('@/pages/DailyGuessPage'))

const LazyFallback = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin size="large" tip="加载中..." />
  </div>
)

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore()
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

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
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/training" element={<TrainingTasks />} />
            <Route path="/backtest" element={<Navigate to="/training" replace />} />
            <Route path="/prediction" element={<Prediction />} />
            <Route path="/payment-config" element={<PaymentConfig />} />
            <Route path="/community" element={<Suspense fallback={<LazyFallback />}><Community /></Suspense>} />
            <Route path="/community/pk" element={<Suspense fallback={<LazyFallback />}><PKArena /></Suspense>} />
            <Route path="/community/leaderboard" element={<Suspense fallback={<LazyFallback />}><Leaderboard /></Suspense>} />
            <Route path="/community/model/:id" element={<Suspense fallback={<LazyFallback />}><CommunityModelDetail /></Suspense>} />
            <Route path="/community/daily-guess" element={<Suspense fallback={<LazyFallback />}><DailyGuessPage /></Suspense>} />
            <Route path="/profile" element={<Suspense fallback={<LazyFallback />}><Profile /></Suspense>} />
            <Route path="/contact" element={<Suspense fallback={<LazyFallback />}><ContactUs /></Suspense>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/config" element={<AdminRoute><AdminConfig /></AdminRoute>} />
            <Route path="/admin/messages" element={<AdminRoute><Suspense fallback={<LazyFallback />}><AdminMessages /></Suspense></AdminRoute>} />
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
